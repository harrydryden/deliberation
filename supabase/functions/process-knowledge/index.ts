import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to extract text from PDF using a simple approach
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  // For now, we'll use a simple text extraction
  // In production, you might want to use a more sophisticated PDF parser
  const uint8Array = new Uint8Array(pdfBuffer);
  const text = new TextDecoder().decode(uint8Array);
  
  // Simple extraction - look for text between common PDF text markers
  const textMatch = text.match(/BT\s+(.*?)\s+ET/gs);
  if (textMatch) {
    return textMatch.map(match => 
      match.replace(/BT\s+|\s+ET/g, '')
           .replace(/\([^)]*\)\s*Tj/g, '')
           .replace(/\d+\s+\d+\s+Td/g, ' ')
           .trim()
    ).join(' ');
  }
  
  // Fallback: try to extract readable text
  return text.replace(/[^\x20-\x7E\n\r]/g, ' ')
             .replace(/\s+/g, ' ')
             .trim();
}

// Function to generate embeddings using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Function to chunk text into smaller pieces
function chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  let currentSize = 0;
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (currentSize + trimmedSentence.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 10)); // Approximate word overlap
      currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
      currentSize = currentChunk.length;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      currentSize = currentChunk.length;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agentId, title, content, contentType, fileName, fileSize } = await req.json();

    console.log('Processing knowledge:', { agentId, title, contentType, fileName });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let textContent = content;

    // If it's a PDF, extract text
    if (contentType === 'pdf' && content) {
      try {
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        textContent = await extractTextFromPDF(bytes.buffer);
        console.log('Extracted text length:', textContent.length);
        
        if (!textContent || textContent.length < 50) {
          throw new Error('Could not extract meaningful text from PDF');
        }
      } catch (error) {
        console.error('PDF text extraction failed:', error);
        throw new Error('Failed to extract text from PDF: ' + error.message);
      }
    }

    // Chunk the text
    const chunks = chunkText(textContent);
    console.log('Created chunks:', chunks.length);

    // Process each chunk
    const knowledgeEntries = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Generate embedding for this chunk
        const embedding = await generateEmbedding(chunk);
        
        // Create knowledge entry
        const { data, error } = await supabase
          .from('agent_knowledge')
          .insert({
            agent_id: agentId,
            title: chunks.length > 1 ? `${title} (Part ${i + 1})` : title,
            content: chunk,
            content_type: contentType,
            file_name: fileName,
            file_size: fileSize,
            chunk_index: i,
            embedding: embedding,
            metadata: {
              total_chunks: chunks.length,
              chunk_size: chunk.length,
              processed_at: new Date().toISOString()
            },
            created_by: (await supabase.auth.getUser()).data.user?.id
          })
          .select()
          .single();

        if (error) {
          console.error('Error inserting knowledge:', error);
          throw error;
        }

        knowledgeEntries.push(data);
        console.log(`Processed chunk ${i + 1}/${chunks.length}`);
      } catch (error) {
        console.error(`Error processing chunk ${i + 1}:`, error);
        throw error;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${chunks.length} chunks`,
        entries: knowledgeEntries.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-knowledge function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});