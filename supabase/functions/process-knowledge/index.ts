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

// Generate search data using Anthropic (keywords and summary for text-based search)
async function generateSearchData(text: string): Promise<{keywords: string[], summary: string}> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    // Fallback: extract basic keywords from text
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const uniqueWords = [...new Set(words)].slice(0, 10);
    return {
      keywords: uniqueWords,
      summary: text.substring(0, 200) + '...'
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze this text and extract:
1. A list of 5-10 key keywords/phrases that would be useful for searching
2. A concise 1-2 sentence summary

Text: "${text}"

Respond in JSON format:
{
  "keywords": ["keyword1", "keyword2", ...],
  "summary": "Brief summary here"
}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;
    
    try {
      const parsed = JSON.parse(responseText);
      return {
        keywords: parsed.keywords || [],
        summary: parsed.summary || ''
      };
    } catch (parseError) {
      console.error('Failed to parse Anthropic response:', responseText);
      throw parseError;
    }
  } catch (error) {
    console.error('Anthropic API error, using fallback:', error);
    // Fallback: extract basic keywords from text
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const uniqueWords = [...new Set(words)].slice(0, 10);
    return {
      keywords: uniqueWords,
      summary: text.substring(0, 200) + '...'
    };
  }
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
        // Generate keywords and summary using Anthropic for search capability
        const searchData = await generateSearchData(chunk);
        
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
            metadata: {
              total_chunks: chunks.length,
              chunk_size: chunk.length,
              processed_at: new Date().toISOString(),
              keywords: searchData.keywords,
              summary: searchData.summary
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