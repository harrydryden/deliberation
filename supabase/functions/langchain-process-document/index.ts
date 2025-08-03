import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { OpenAIEmbeddings } from 'https://esm.sh/@langchain/openai@0.6.3';
import { RecursiveCharacterTextSplitter } from 'https://esm.sh/langchain@0.3.30/text_splitter';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration constants
const BATCH_SIZE = 10; // Process embeddings in batches
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MIN_CHUNK_LENGTH = 50;

// Progress tracking for streaming updates
let progressCallback: ((progress: number, message: string) => void) | null = null;

// Enhanced PDF text extraction using multiple techniques
async function extractPDFText(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const fileSize = arrayBuffer.byteLength;
  console.log(`PDF file size: ${fileSize} bytes`);

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error('PDF file too large. Please upload files smaller than 25MB.');
  }

  const bytes = new Uint8Array(arrayBuffer);
  const textPatterns: string[] = [];

  // Try multiple encoding strategies
  const encodings = ['utf-8', 'latin1', 'utf-16le'];
  
  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      const pdfString = decoder.decode(bytes);
      
      // Pattern 1: Text streams (between stream/endstream)
      const streamMatches = pdfString.match(/stream\s*\n([\s\S]*?)\s*endstream/g) || [];
      streamMatches.forEach(match => {
        const content = match.replace(/^stream\s*\n/, '').replace(/\s*endstream$/, '');
        // Extract readable text from stream content
        const readableText = content.match(/[A-Za-z][A-Za-z\s\.,;:!?]{10,}/g) || [];
        textPatterns.push(...readableText);
      });

      // Pattern 2: Text between parentheses (common PDF text encoding)
      const parenMatches = pdfString.match(/\(([^)]{3,})\)/g) || [];
      textPatterns.push(...parenMatches.map(match => match.slice(1, -1)));

      // Pattern 3: Text between square brackets
      const bracketMatches = pdfString.match(/\[([^\]]{3,})\]/g) || [];
      textPatterns.push(...bracketMatches.map(match => match.slice(1, -1)));

      // Pattern 4: Look for plain text sequences
      const plainTextMatches = pdfString.match(/[A-Za-z][A-Za-z\s\.,;:!?]{15,}/g) || [];
      textPatterns.push(...plainTextMatches);

      // Pattern 5: BT/ET blocks (text blocks in PDF)
      const textBlockMatches = pdfString.match(/BT\s+([\s\S]*?)\s+ET/g) || [];
      textBlockMatches.forEach(block => {
        const textContent = block.replace(/^BT\s+/, '').replace(/\s+ET$/, '');
        const readableText = textContent.match(/[A-Za-z][A-Za-z\s\.,;:!?]{5,}/g) || [];
        textPatterns.push(...readableText);
      });

    } catch (error) {
      console.warn(`Failed to decode with ${encoding}:`, error.message);
    }
  }

  // Filter, clean, and deduplicate extracted text
  const cleanedText = textPatterns
    .filter(text => {
      return (
        text &&
        text.length > 3 &&
        /[A-Za-z]/.test(text) &&
        !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/.test(text) &&
        text.split(/\s+/).length > 2 // At least 3 words
      );
    })
    .map(text => text.trim().replace(/\s+/g, ' '))
    .filter((text, index, array) => array.indexOf(text) === index) // Remove duplicates
    .filter(text => text.length > 0);

  let textContent = cleanedText.join(' ').trim();

  // Enhanced fallback with better structure detection
  if (textContent.length < 100) {
    textContent = `PDF Document: ${fileName}

This PDF contains primarily structured data, forms, or images that cannot be easily extracted as plain text.
File size: ${Math.round(fileSize / 1024)} KB.

The document appears to contain:
- Structured data or forms
- Images or graphics
- Non-standard text encoding

For better text extraction, please:
1. Convert this PDF to a plain text format before uploading
2. Ensure the PDF contains selectable text
3. Use a PDF with standard text encoding`;
  }

  return textContent;
}

// Batch processing for embeddings with retry logic
async function processBatchEmbeddings(
  chunks: string[], 
  embeddings: OpenAIEmbeddings, 
  batchIndex: number,
  totalBatches: number
): Promise<number[][]> {
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    try {
      progressCallback?.(
        (batchIndex / totalBatches) * 0.7 + 0.2, // 20-90% of total progress
        `Processing embeddings batch ${batchIndex + 1}/${totalBatches} (attempt ${attempt + 1})`
      );

      // Process embeddings in parallel for the batch
      const embeddingPromises = chunks.map(chunk => embeddings.embedQuery(chunk));
      const batchEmbeddings = await Promise.all(embeddingPromises);
      
      console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed successfully`);
      return batchEmbeddings;
    } catch (error) {
      attempt++;
      console.error(`❌ Batch ${batchIndex + 1} attempt ${attempt} failed:`, error.message);
      
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Failed to process batch ${batchIndex + 1} after ${MAX_RETRIES} attempts: ${error.message}`);
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
    }
  }
  
  throw new Error('Unexpected error in batch processing');
}

// Bulk database operations with batching
async function bulkInsertKnowledge(
  supabase: any,
  knowledgeItems: any[],
  batchIndex: number,
  totalBatches: number
): Promise<number> {
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    try {
      progressCallback?.(
        0.9 + (batchIndex / totalBatches) * 0.1, // 90-100% of total progress
        `Saving batch ${batchIndex + 1}/${totalBatches} to database (attempt ${attempt + 1})`
      );

      const { error } = await supabase.from('agent_knowledge').insert(knowledgeItems);
      
      if (error) {
        throw error;
      }
      
      console.log(`✅ Database batch ${batchIndex + 1}/${totalBatches} saved successfully`);
      return knowledgeItems.length;
    } catch (error) {
      attempt++;
      console.error(`❌ Database batch ${batchIndex + 1} attempt ${attempt} failed:`, error.message);
      
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Failed to save batch ${batchIndex + 1} after ${MAX_RETRIES} attempts: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
    }
  }
  
  throw new Error('Unexpected error in database operations');
}

// Check if document was already processed (deduplication)
async function checkDocumentExists(supabase: any, agentId: string, fileName: string, fileSize: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('agent_knowledge')
    .select('id')
    .eq('agent_id', agentId)
    .eq('file_name', fileName)
    .eq('original_file_size', fileSize)
    .limit(1);
  
  if (error) {
    console.warn('Error checking document existence:', error);
    return false;
  }
  
  return data && data.length > 0;
}

serve(async (req) => {
  console.log('🚀 OPTIMIZED LANGCHAIN DOCUMENT PROCESSING FUNCTION CALLED');
  console.log('Method:', req.method);

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Parse request body
    const body = await req.json();
    console.log('📄 Processing document:', body.fileName);
    console.log('🤖 Agent ID:', body.agentId);
    console.log('📁 Storage path:', body.storagePath);

    const { agentId, storagePath, fileName, contentType } = body;

    // Check required fields
    if (!agentId || !storagePath) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing agentId or storagePath',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize progress tracking
    progressCallback = (progress: number, message: string) => {
      console.log(`📊 Progress: ${Math.round(progress * 100)}% - ${message}`);
    };

    progressCallback(0.05, 'Initializing Supabase client');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAIApiKey) {
      console.error('OpenAI API key not configured');
      throw new Error('Service configuration error');
    }

    progressCallback(0.1, 'Validating agent configuration');

    // Validate that the agent is a local agent (not a global template)
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single();

    if (agentError) {
      console.error('Agent validation error:', agentError);
      throw new Error('Invalid agent ID');
    }

    if (!agentData.deliberation_id) {
      console.error('Attempted to upload knowledge to global agent:', agentId);
      throw new Error(
        'Knowledge can only be uploaded to local agents (specific to deliberations), not global template agents'
      );
    }

    progressCallback(0.15, 'Downloading file from storage');

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);

    if (downloadError) {
      console.error('Storage download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Check for document deduplication
    const fileSize = fileData.size;
    progressCallback(0.18, 'Checking for duplicate documents');
    
    const documentExists = await checkDocumentExists(supabase, agentId, fileName, fileSize);
    if (documentExists) {
      console.log('📋 Document already processed, skipping');
      return new Response(
        JSON.stringify({
          success: true,
          chunksProcessed: 0,
          message: 'Document already processed (duplicate detected)',
          skipped: true,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    progressCallback(0.2, 'Extracting text content');

    let textContent = '';

    if (contentType === 'pdf') {
      const arrayBuffer = await fileData.arrayBuffer();
      textContent = await extractPDFText(arrayBuffer, fileName);
    } else {
      textContent = await fileData.text();
    }

    if (!textContent || textContent.trim().length < 10) {
      throw new Error('No meaningful text content extracted from the document');
    }

    console.log(`📝 Extracted text length: ${textContent.length} characters`);

    // Initialize LangChain components
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: openAIApiKey,
      modelName: 'text-embedding-3-small',
    });

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', '? ', '! ', ' ', ''],
    });

    progressCallback(0.25, 'Splitting text into chunks');

    // Split the document into chunks using LangChain
    const documents = await textSplitter.createDocuments([textContent], [
      {
        agentId,
        fileName,
        contentType,
        storagePath,
        originalFileSize: fileSize,
      },
    ]);

    // Filter out very short chunks
    const validChunks = documents.filter(doc => doc.pageContent.trim().length >= MIN_CHUNK_LENGTH);
    console.log(`📊 Created ${validChunks.length} valid chunks (filtered from ${documents.length} total)`);

    if (validChunks.length === 0) {
      throw new Error('No valid chunks could be created from the document');
    }

    // Process embeddings in batches
    const chunks = validChunks.map(doc => doc.pageContent.trim());
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
    const allEmbeddings: number[][] = [];

    console.log(`🔄 Processing ${chunks.length} chunks in ${totalBatches} batches of ${BATCH_SIZE}`);

    // Process embeddings in parallel batches
    for (let i = 0; i < totalBatches; i++) {
      const startIdx = i * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, chunks.length);
      const batchChunks = chunks.slice(startIdx, endIdx);
      
      const batchEmbeddings = await processBatchEmbeddings(
        batchChunks, 
        embeddings, 
        i, 
        totalBatches
      );
      
      allEmbeddings.push(...batchEmbeddings);
    }

    progressCallback(0.9, 'Preparing database records');

    // Prepare all knowledge items for bulk insert
    const knowledgeItems = validChunks.map((doc, index) => {
      const chunk = doc.pageContent.trim();
      const sanitizedChunk = chunk
        .replace(/\u0000/g, '') // Remove null bytes
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .trim();

      return {
        agent_id: agentId,
        title: `${fileName} - Part ${index + 1}`,
        content: sanitizedChunk,
        content_type: contentType,
        file_name: fileName,
        chunk_index: index,
        file_size: textContent.length,
        embedding: allEmbeddings[index],
        storage_path: storagePath,
        original_file_size: fileSize,
        processing_status: 'completed',
        metadata: {
          total_chunks: validChunks.length,
          chunk_size: chunk.length,
          original_file_type: contentType,
          langchain_processed: true,
          splitter_type: 'RecursiveCharacterTextSplitter',
          batch_processed: true,
          processing_date: new Date().toISOString(),
        },
      };
    });

    // Bulk insert in batches to avoid database limits
    let totalProcessed = 0;
    const dbBatchSize = 50; // Smaller batches for database operations
    const dbBatches = Math.ceil(knowledgeItems.length / dbBatchSize);

    for (let i = 0; i < dbBatches; i++) {
      const startIdx = i * dbBatchSize;
      const endIdx = Math.min(startIdx + dbBatchSize, knowledgeItems.length);
      const batchItems = knowledgeItems.slice(startIdx, endIdx);
      
      const processed = await bulkInsertKnowledge(supabase, batchItems, i, dbBatches);
      totalProcessed += processed;
    }

    progressCallback(1.0, 'Processing completed successfully');

    console.log(`✅ OPTIMIZED processing complete! ${totalProcessed} chunks processed in batches`);
    console.log(`⚡ Performance improvements: batch embeddings, bulk database operations, deduplication`);

    return new Response(
      JSON.stringify({
        success: true,
        chunksProcessed: totalProcessed,
        totalChunks: validChunks.length,
        batchesProcessed: totalBatches,
        message: `Successfully processed ${totalProcessed} knowledge chunks using optimized batch processing`,
        langchainProcessed: true,
        optimized: true,
        performance: {
          embeddingBatches: totalBatches,
          databaseBatches: dbBatches,
          batchSize: BATCH_SIZE,
          deduplicationEnabled: true,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ ERROR IN OPTIMIZED DOCUMENT PROCESSING');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    return new Response(
      JSON.stringify({
        success: false,
        error: `Optimized document processing error: ${error.message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});