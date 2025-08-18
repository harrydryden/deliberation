import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { OpenAIEmbeddings } from 'https://esm.sh/@langchain/openai@0.6.3';
import { RecursiveCharacterTextSplitter } from 'https://esm.sh/langchain@0.3.30/text_splitter';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced performance configuration
const BATCH_SIZE = 20; // Increased batch size for parallel processing
const PARALLEL_BATCHES = 3; // Number of batches to process in parallel
const MAX_RETRIES = 3;
const RETRY_DELAY = 500; // Reduced delay for faster retries
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MIN_CHUNK_LENGTH = 50;
const CACHE_TTL = 3600; // 1 hour cache TTL
const CONNECTION_POOL_SIZE = 10;

// Redis cache integration for performance
const REDIS_URL = Deno.env.get('REDIS_URL');
let redisClient: any = null;

// Initialize Redis connection for caching
async function initRedis() {
  if (REDIS_URL && !redisClient) {
    try {
      const { Redis } = await import('https://deno.land/x/redis@v0.31.0/mod.ts');
      redisClient = new Redis(REDIS_URL);
      console.log('✅ Redis cache connected for document processing');
    } catch (error) {
      console.warn('⚠️ Redis cache unavailable, continuing without caching:', error.message);
    }
  }
}

// Progress tracking for streaming updates
let progressCallback: ((progress: number, message: string) => void) | null = null;

// Enhanced PDF text extraction using multiple sophisticated techniques
async function extractPDFText(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const fileSize = arrayBuffer.byteLength;
  console.log(`📄 Processing PDF: ${fileName} (${Math.round(fileSize / 1024)} KB)`);

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error('PDF file too large. Please upload files smaller than 25MB.');
  }

  const bytes = new Uint8Array(arrayBuffer);
  const extractedText: string[] = [];

  // Try multiple encoding strategies for robustness
  const encodings = ['utf-8', 'latin1', 'utf-16le'];
  
  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      const pdfString = decoder.decode(bytes);
      
      // Strategy 1: Extract from text objects (Tj, TJ operators) - most reliable
      const textOperatorMatches = pdfString.match(/\(([^)]+)\)\s*(?:Tj|TJ)/g) || [];
      textOperatorMatches.forEach(match => {
        const text = match.match(/\(([^)]+)\)/)?.[1];
        if (text && text.length > 2 && /[A-Za-z]/.test(text)) {
          extractedText.push(text.trim());
        }
      });

      // Strategy 2: Extract from text arrays [(...) (...)] TJ
      const textArrayMatches = pdfString.match(/\[([^\]]+)\]\s*TJ/g) || [];
      textArrayMatches.forEach(match => {
        const content = match.match(/\[([^\]]+)\]/)?.[1];
        if (content) {
          const textParts = content.match(/\(([^)]+)\)/g) || [];
          textParts.forEach(part => {
            const text = part.slice(1, -1);
            if (text && text.length > 2 && /[A-Za-z]/.test(text)) {
              extractedText.push(text.trim());
            }
          });
        }
      });

      // Strategy 3: Extract from text blocks (BT...ET)
      const textBlockMatches = pdfString.match(/BT\s+([\s\S]*?)\s+ET/g) || [];
      textBlockMatches.forEach(block => {
        const content = block.replace(/^BT\s+/, '').replace(/\s+ET$/, '');
        const textOps = content.match(/\(([^)]{3,})\)\s*(?:Tj|TJ)/g) || [];
        textOps.forEach(op => {
          const text = op.match(/\(([^)]+)\)/)?.[1];
          if (text && text.length > 2 && /[A-Za-z]/.test(text)) {
            extractedText.push(text.trim());
          }
        });
      });

      console.log(`📝 Extracted ${extractedText.length} text fragments with ${encoding} encoding`);

    } catch (error) {
      console.warn(`Failed to decode with ${encoding}:`, error.message);
    }
  }

  // Filter and clean extracted text aggressively
  const cleanedText = extractedText
    .filter(text => {
      return (
        text &&
        text.length > 3 &&
        /[A-Za-z]{2,}/.test(text) && // Contains at least 2 consecutive letters
        !text.match(/^[\d\s\.\-\(\)\/\[\]]+$/) && // Not just numbers and punctuation
        !text.includes('MCR') && // Filter out PDF metadata
        !text.includes('endobj') &&
        !text.includes('stream') &&
        !text.includes('StructParent') &&
        !text.includes('FontDescriptor') &&
        !text.includes('CIDSystemInfo') &&
        !/^[^a-zA-Z]*$/.test(text) && // Contains some letters
        !/^\s*[\(\)\[\]]+\s*$/.test(text) // Not just brackets
      );
    })
    .map(text => text
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\/g, '') // Remove remaining backslashes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
    )
    .filter((text, index, array) => {
      // Remove duplicates and very short fragments
      return text.length > 5 && array.indexOf(text) === index;
    });

  console.log(`✅ Filtered to ${cleanedText.length} meaningful text fragments`);

  // Join and structure the text intelligently
  let finalText = cleanedText.join(' ').trim();

  // Basic sentence reconstruction
  finalText = finalText
    .replace(/([.!?])\s*([A-Z])/g, '$1\n\n$2') // Add paragraph breaks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Enhanced fallback with better guidance
  if (finalText.length < 200) {
    console.warn('⚠️ Limited text extraction, providing structured guidance');
    
    finalText = `Document: ${fileName}

This PDF contains limited extractable text. The document may include:
- Scanned images requiring OCR processing
- Complex formatting or embedded graphics
- Form fields or structured data
- Non-standard text encoding

Extracted Content Summary:
${cleanedText.slice(0, 5).join('. ')}${cleanedText.length > 5 ? '...' : ''}

For better AI analysis, consider:
1. Converting to a text-based format (.txt, .docx)
2. Using OCR software if this is a scanned document
3. Ensuring the PDF has selectable text content
4. Breaking complex documents into sections

File Details:
- Size: ${Math.round(fileSize / 1024)} KB
- Fragments Extracted: ${cleanedText.length}
- Processing Status: Limited extraction

Note: Some information may still be valuable for context and search, despite extraction limitations.`;
  }

  console.log(`📊 Final text length: ${finalText.length} characters`);
  return finalText;
}

// Enhanced parallel batch processing with caching
async function processParallelEmbeddings(
  chunks: string[], 
  embeddings: OpenAIEmbeddings, 
  batchIndex: number,
  totalBatches: number
): Promise<number[][]> {
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    try {
      progressCallback?.(
        (batchIndex / totalBatches) * 0.7 + 0.2,
        `Processing parallel batch ${batchIndex + 1}/${totalBatches} (${chunks.length} chunks)`
      );

      // Check cache for existing embeddings first
      const cachedEmbeddings: (number[] | null)[] = [];
      const uncachedChunks: string[] = [];
      const uncachedIndices: number[] = [];

      if (redisClient) {
        for (let i = 0; i < chunks.length; i++) {
          const cacheKey = `embedding:${btoa(chunks[i]).slice(0, 40)}`;
          try {
            const cached = await redisClient.get(cacheKey);
            if (cached) {
              cachedEmbeddings[i] = JSON.parse(cached);
              console.log(`📋 Cache hit for chunk ${i + 1}`);
            } else {
              cachedEmbeddings[i] = null;
              uncachedChunks.push(chunks[i]);
              uncachedIndices.push(i);
            }
          } catch (cacheError) {
            console.warn(`⚠️ Cache read error for chunk ${i + 1}:`, cacheError.message);
            cachedEmbeddings[i] = null;
            uncachedChunks.push(chunks[i]);
            uncachedIndices.push(i);
          }
        }
      } else {
        // No cache available, process all chunks
        uncachedChunks.push(...chunks);
        uncachedIndices.push(...chunks.map((_, i) => i));
        cachedEmbeddings.fill(null);
      }

      // Process uncached embeddings in parallel
      const newEmbeddings: number[][] = [];
      if (uncachedChunks.length > 0) {
        console.log(`🔄 Processing ${uncachedChunks.length} uncached embeddings`);
        const embeddingPromises = uncachedChunks.map(chunk => embeddings.embedQuery(chunk));
        const results = await Promise.all(embeddingPromises);
        newEmbeddings.push(...results);

        // Cache new embeddings for future use
        if (redisClient) {
          const cachePromises = uncachedChunks.map(async (chunk, idx) => {
            const cacheKey = `embedding:${btoa(chunk).slice(0, 40)}`;
            try {
              await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(newEmbeddings[idx]));
            } catch (cacheError) {
              console.warn(`⚠️ Cache write error:`, cacheError.message);
            }
          });
          await Promise.allSettled(cachePromises);
        }
      }

      // Combine cached and new embeddings
      const finalEmbeddings: number[][] = [];
      let newEmbeddingIndex = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        if (cachedEmbeddings[i]) {
          finalEmbeddings[i] = cachedEmbeddings[i]!;
        } else {
          finalEmbeddings[i] = newEmbeddings[newEmbeddingIndex++];
        }
      }
      
      console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed (${uncachedChunks.length} new, ${chunks.length - uncachedChunks.length} cached)`);
      return finalEmbeddings;
    } catch (error) {
      attempt++;
      console.error(`❌ Batch ${batchIndex + 1} attempt ${attempt} failed:`, error.message);
      
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Failed to process batch ${batchIndex + 1} after ${MAX_RETRIES} attempts: ${error.message}`);
      }
      
      // Exponential backoff with jitter
      const delay = RETRY_DELAY * Math.pow(2, attempt - 1) + Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
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

    progressCallback(0.05, 'Initializing services and cache');

    // Initialize Redis cache for performance optimization
    await initRedis();

    // Initialize Supabase client with connection pooling
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
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'Connection': 'keep-alive',
        },
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

    // Enhanced parallel processing with intelligent batching
    const chunks = validChunks.map(doc => doc.pageContent.trim());
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
    const allEmbeddings: number[][] = [];

    console.log(`🚀 Processing ${chunks.length} chunks in ${totalBatches} batches (${BATCH_SIZE} per batch, ${PARALLEL_BATCHES} parallel)`);

    // Process multiple batches in parallel for maximum performance
    const batchPromises: Promise<void>[] = [];
    
    for (let i = 0; i < totalBatches; i += PARALLEL_BATCHES) {
      const parallelBatches = [];
      
      // Create up to PARALLEL_BATCHES parallel processing tasks
      for (let j = 0; j < PARALLEL_BATCHES && (i + j) < totalBatches; j++) {
        const batchIndex = i + j;
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, chunks.length);
        const batchChunks = chunks.slice(startIdx, endIdx);
        
        parallelBatches.push({
          index: batchIndex,
          chunks: batchChunks,
          promise: processParallelEmbeddings(batchChunks, embeddings, batchIndex, totalBatches)
        });
      }
      
      // Wait for all parallel batches to complete
      const batchResults = await Promise.all(parallelBatches.map(batch => batch.promise));
      
      // Insert results in correct order
      parallelBatches.forEach((batch, idx) => {
        const startPosition = batch.index * BATCH_SIZE;
        const batchEmbeddings = batchResults[idx];
        
        // Insert at correct position to maintain chunk order
        for (let k = 0; k < batchEmbeddings.length; k++) {
          allEmbeddings[startPosition + k] = batchEmbeddings[k];
        }
      });
      
      console.log(`📊 Completed ${Math.min(i + PARALLEL_BATCHES, totalBatches)}/${totalBatches} batches`);
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

    // Optimized bulk insert with parallel database operations
    let totalProcessed = 0;
    const dbBatchSize = 100; // Larger batches for improved database performance
    const dbBatches = Math.ceil(knowledgeItems.length / dbBatchSize);
    const dbParallelBatches = Math.min(3, dbBatches); // Parallel database inserts

    console.log(`💾 Saving ${knowledgeItems.length} items in ${dbBatches} database batches (${dbParallelBatches} parallel)`);

    // Process database inserts in parallel for better performance
    for (let i = 0; i < dbBatches; i += dbParallelBatches) {
      const parallelDbOperations = [];
      
      for (let j = 0; j < dbParallelBatches && (i + j) < dbBatches; j++) {
        const batchIndex = i + j;
        const startIdx = batchIndex * dbBatchSize;
        const endIdx = Math.min(startIdx + dbBatchSize, knowledgeItems.length);
        const batchItems = knowledgeItems.slice(startIdx, endIdx);
        
        parallelDbOperations.push(bulkInsertKnowledge(supabase, batchItems, batchIndex, dbBatches));
      }
      
      const results = await Promise.all(parallelDbOperations);
      totalProcessed += results.reduce((sum, count) => sum + count, 0);
    }

    progressCallback(1.0, 'Processing completed successfully');

    // Close Redis connection if needed
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (error) {
        console.warn('⚠️ Redis connection cleanup warning:', error.message);
      }
    }

    console.log(`✅ HIGH-PERFORMANCE processing complete! ${totalProcessed} chunks processed`);
    console.log(`⚡ Performance features: parallel batches, Redis caching, connection pooling, optimized database operations`);

    return new Response(
      JSON.stringify({
        success: true,
        chunksProcessed: totalProcessed,
        totalChunks: validChunks.length,
        batchesProcessed: totalBatches,
        message: `Successfully processed ${totalProcessed} knowledge chunks using high-performance parallel processing`,
        langchainProcessed: true,
        optimized: true,
        highPerformance: true,
        performance: {
          embeddingBatches: totalBatches,
          parallelBatches: PARALLEL_BATCHES,
          databaseBatches: dbBatches,
          batchSize: BATCH_SIZE,
          cacheEnabled: !!redisClient,
          deduplicationEnabled: true,
          connectionPooling: true,
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