import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import OpenAI from "https://esm.sh/openai@4.38.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple text splitter
class TextSplitter {
  constructor(
    private chunkSize: number = 1000,
    private chunkOverlap: number = 200,
    private separators: string[] = ['\n\n', '\n', '. ', '? ', '! ', ' ', '']
  ) {}

  splitText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;
      if (end > text.length) end = text.length;

      // Try to break at separators
      if (end < text.length) {
        for (const separator of this.separators) {
          const lastSep = text.lastIndexOf(separator, end);
          if (lastSep > start + this.chunkSize * 0.5) {
            end = lastSep + separator.length;
            break;
          }
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - this.chunkOverlap;
      if (start < 0) start = 0;
    }

    return chunks.filter(chunk => chunk.length > 0);
  }
}

// PDF text extraction using PDF.js with proper Deno import
async function extractPDFText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // Import PDF.js with proper Deno compatibility
    const pdfjs = await import('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.min.mjs');
    
    // Load the PDF document with proper configuration
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: false,
      disableFontFace: true,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableAutoFetch: true,
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    console.log(`PDF has ${pdf.numPages} pages`);
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .filter((text: string) => text.trim().length > 0)
          .join(' ');
        
        if (pageText.trim()) {
          fullText += pageText + '\n\n';
        }
        
        console.log(`Extracted ${pageText.length} characters from page ${pageNum}`);
      } catch (pageError) {
        console.warn(`Failed to extract text from page ${pageNum}:`, pageError);
        // Continue with other pages
      }
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('PDF parsing error:', error);
    
    // Fallback: try to extract some basic text or return error for manual processing
    throw new Error(`Failed to extract text from PDF: ${error.message}. Please try uploading a text file instead or a simpler PDF.`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { fileName, agentId, userId } = await req.json();

    console.log(`Processing document: ${fileName} for agent: ${agentId}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(fileName);

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Extract text based on file type
    const arrayBuffer = await fileData.arrayBuffer();
    let extractedText = '';
    
    if (fileName.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractPDFText(arrayBuffer);
    } else {
      // Handle text files
      const decoder = new TextDecoder('utf-8');
      extractedText = decoder.decode(arrayBuffer);
    }

    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error('No meaningful text content found in the document');
    }

    console.log(`Extracted text length: ${extractedText.length} characters`);

    // Split into chunks
    const textSplitter = new TextSplitter();
    const chunks = textSplitter.splitText(extractedText);

    console.log(`Created ${chunks.length} chunks`);

    // Generate embeddings with OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // Process chunks in batches
    const batchSize = 20;
    const allKnowledgeEntries = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(chunks.length / batchSize)}`);

      // Generate embeddings for batch
      const embeddings = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch
      });

      // Prepare knowledge entries
      const knowledgeEntries = batch.map((chunk, index) => ({
        agent_id: agentId,
        title: `${fileName.split('/').pop()} - Chunk ${i + index + 1}`,
        content: chunk,
        content_type: fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'text',
        file_name: fileName.split('/').pop(),
        storage_path: fileName,
        chunk_index: i + index,
        embedding: embeddings.data[index].embedding,
        created_by: userId,
        metadata: {
          originalFileName: fileName.split('/').pop(),
          chunkSize: chunk.length,
          processingTimestamp: new Date().toISOString()
        }
      }));

      // Insert batch into database
      const { error: insertError } = await supabase
        .from('agent_knowledge')
        .insert(knowledgeEntries);

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw new Error(`Failed to save knowledge: ${insertError.message}`);
      }

      allKnowledgeEntries.push(...knowledgeEntries);
    }

    console.log(`Successfully processed ${chunks.length} chunks for ${fileName}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully processed ${fileName}`,
      chunksProcessed: chunks.length,
      totalChunks: chunks.length,
      fileName: fileName.split('/').pop()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in process-document-upload function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});