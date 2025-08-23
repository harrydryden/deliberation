import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// Use direct OpenAI API calls to avoid LangChain dependency issues
class OpenAIEmbeddings {
  constructor(private config: { openAIApiKey: string; modelName?: string }) {}

  async embedQuery(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.modelName || 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}

// Simple text splitter that mimics LangChain's RecursiveCharacterTextSplitter
class RecursiveCharacterTextSplitter {
  constructor(private config: { 
    chunkSize: number; 
    chunkOverlap: number; 
    separators: string[]; 
  }) {}

  async createDocuments(texts: string[], metadatas: any[] = []): Promise<{ pageContent: string; metadata: any }[]> {
    const documents: { pageContent: string; metadata: any }[] = [];
    
    texts.forEach((text, i) => {
      const chunks = this.splitText(text);
      chunks.forEach(chunk => {
        documents.push({
          pageContent: chunk,
          metadata: metadatas[i] || {}
        });
      });
    });
    
    return documents;
  }

  private splitText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.config.chunkSize;
      if (end > text.length) end = text.length;

      // Try to break at separators
      if (end < text.length) {
        for (const separator of this.config.separators) {
          const lastSep = text.lastIndexOf(separator, end);
          if (lastSep > start + this.config.chunkSize * 0.5) {
            end = lastSep + separator.length;
            break;
          }
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - this.config.chunkOverlap;
      if (start < 0) start = 0;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced performance configuration
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const RETRY_DELAY = 500;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Enhanced PDF text extraction
async function extractPDFText(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const fileSize = arrayBuffer.byteLength;
  console.log(`📄 Processing PDF: ${fileName} (${Math.round(fileSize / 1024)} KB)`);

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error('PDF file too large. Please upload files smaller than 25MB.');
  }

  const bytes = new Uint8Array(arrayBuffer);
  const extractedText: string[] = [];

  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const pdfString = decoder.decode(bytes);
    
    // Extract from text objects (Tj, TJ operators)
    const textOperatorMatches = pdfString.match(/\(([^)]+)\)\s*(?:Tj|TJ)/g) || [];
    textOperatorMatches.forEach(match => {
      const text = match.match(/\(([^)]+)\)/)?.[1];
      if (text && text.length > 2 && /[A-Za-z]/.test(text)) {
        extractedText.push(text.trim());
      }
    });

    // Extract from text arrays
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

  } catch (error) {
    console.warn('PDF text extraction failed:', error.message);
  }

  // Filter and clean extracted text
  const cleanedText = extractedText
    .filter(text => {
      return (
        text &&
        text.length > 3 &&
        /[A-Za-z]{2,}/.test(text) &&
        !text.match(/^[\d\s\.\-\(\)\/\[\]]+$/) &&
        !text.includes('MCR') &&
        !text.includes('endobj')
      );
    })
    .map(text => text
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter((text, index, array) => {
      return text.length > 5 && array.indexOf(text) === index;
    });

  console.log(`✅ Filtered to ${cleanedText.length} meaningful text fragments`);

  let finalText = cleanedText.join(' ').trim();

  if (finalText.length < 200) {
    finalText = `Document: ${fileName}

This PDF contains limited extractable text. The document may include:
- Scanned images requiring OCR processing
- Complex formatting or embedded graphics
- Form fields or structured data

Extracted Content: ${cleanedText.slice(0, 5).join('. ')}

For better processing, consider converting to a text-based format.`;
  }

  console.log(`📊 Final text length: ${finalText.length} characters`);
  return finalText;
}

// Process embeddings in batches using LangChain
async function processEmbeddings(chunks: string[], embeddings: OpenAIEmbeddings): Promise<number[][]> {
  const results: number[][] = [];
  
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
    
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        const batchResults = await Promise.all(
          batch.map(chunk => embeddings.embedQuery(chunk))
        );
        results.push(...batchResults);
        break;
      } catch (error) {
        attempt++;
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Failed to process batch after ${MAX_RETRIES} attempts: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }
  
  return results;
}

serve(async (req) => {
  console.log('🚀 LangChain Document Processing Function Called');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    const body = await req.json();
    console.log('📄 Processing:', body.fileName);

    const { agentId, storagePath, fileName, contentType } = body;

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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Validate agent
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single();

    if (agentError || !agentData.deliberation_id) {
      throw new Error('Invalid agent ID or agent is not local to a deliberation');
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Extract text content
    let textContent = '';
    if (contentType === 'pdf') {
      const arrayBuffer = await fileData.arrayBuffer();
      textContent = await extractPDFText(arrayBuffer, fileName);
    } else {
      textContent = await fileData.text();
    }

    if (!textContent || textContent.trim().length < 10) {
      throw new Error('No meaningful text content extracted');
    }

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

    // Split text into chunks
    const documents = await textSplitter.createDocuments([textContent], [
      { agentId, fileName, contentType }
    ]);

    const chunks = documents.map(doc => doc.pageContent);
    console.log(`📝 Created ${chunks.length} chunks`);

    // Generate embeddings
    console.log('🧠 Generating embeddings...');
    const embeddingVectors = await processEmbeddings(chunks, embeddings);

    // Prepare knowledge items for database
    const knowledgeItems = chunks.map((chunk, index) => ({
      agent_id: agentId,
      title: `${fileName} - Chunk ${index + 1}`,
      content: chunk,
      content_type: contentType || 'text',
      file_name: fileName,
      chunk_index: index,
      embedding: JSON.stringify(embeddingVectors[index]),
    }));

    // Insert into database in batches
    console.log('💾 Saving to database...');
    for (let i = 0; i < knowledgeItems.length; i += BATCH_SIZE) {
      const batch = knowledgeItems.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('agent_knowledge').insert(batch);
      if (error) {
        console.error('Database error:', error);
        throw new Error(`Failed to save knowledge: ${error.message}`);
      }
    }

    console.log('✅ Processing complete');

    return new Response(
      JSON.stringify({
        success: true,
        chunksProcessed: chunks.length,
        totalChunks: chunks.length,
        message: `Successfully processed ${chunks.length} chunks`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Processing failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});