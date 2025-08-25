import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://iowsxuxkgvpgrvvklwyt.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzMwMDA5NiwiZXhwIjoyMDY4ODc2MDk2fQ.VLD-yck9_WrJjFanhnMZ5MzQcKv_zkfOJ7e5L1dS2Ck';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface PdfProcessingRequest {
  fileUrl: string;
  fileName: string;
  deliberationId: string;
  userId: string;
}

interface PdfProcessingResult {
  success: boolean;
  text: string;
  pages: number;
  strategy: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

serve(async (req) => {
  console.log('OpenAI PDF Processor function called:', req.method, req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Processing PDF extraction request with OpenAI...');
    
    // Verify JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      throw new Error('Invalid authentication');
    }

    console.log('User authenticated:', user.id);

    const requestBody = await req.json();
    console.log('Request body received:', requestBody);
    console.log('fileUrl type:', typeof requestBody.fileUrl);
    console.log('fileUrl value:', requestBody.fileUrl);
    console.log('fileUrl length:', requestBody.fileUrl?.length);
    
    const { fileUrl, fileName, deliberationId, userId }: PdfProcessingRequest = requestBody;

    if (!fileUrl || !fileName || !deliberationId || !userId) {
      console.error('Missing parameters:', { fileUrl: !!fileUrl, fileName: !!fileName, deliberationId: !!deliberationId, userId: !!userId });
      throw new Error('Missing required parameters');
    }

    // Validate that fileUrl is a complete URL
    if (!fileUrl.startsWith('http')) {
      console.error('Invalid fileUrl format - expected complete URL, got:', fileUrl);
      throw new Error(`Invalid fileUrl format: expected complete URL starting with 'http', got: ${fileUrl}`);
    }

    console.log('Starting OpenAI PDF processing for:', fileName);
    console.log('Using fileUrl:', fileUrl);

    // Process the PDF with OpenAI
    const result = await processPdfWithOpenAI(fileUrl, fileName);

    if (result.success) {
      console.log('OpenAI PDF processing successful, storing in knowledge base...');
      // Store the extracted text in the knowledge base
      await storeExtractedText(result, deliberationId, userId, fileName);
      console.log('Knowledge chunks stored successfully');
    } else {
      console.warn('OpenAI PDF processing failed:', result.error);
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('OpenAI PDF Processing Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        text: '',
        pages: 0,
        strategy: 'none'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function processPdfWithOpenAI(fileUrl: string, fileName: string): Promise<PdfProcessingResult> {
  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Using OpenAI for PDF processing...');

    // Use OpenAI's vision API to extract text from PDF
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a PDF text extraction specialist. Extract all readable text from the provided PDF document. Preserve the structure and formatting as much as possible. Return only the extracted text, no additional commentary.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Please extract all readable text from this PDF document: ${fileName}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: fileUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content || '';

    if (!extractedText.trim()) {
      throw new Error('No text extracted from PDF');
    }

    console.log('OpenAI extraction successful, text length:', extractedText.length);

    return {
      success: true,
      text: extractedText.trim(),
      pages: 1, // OpenAI doesn't provide page count, so we'll estimate
      strategy: 'openai-vision',
      metadata: {
        fileName,
        extractionMethod: 'OpenAI Vision API',
        textLength: extractedText.length,
        model: 'gpt-4o'
      }
    };

  } catch (error) {
    console.error('OpenAI PDF processing failed:', error);
    return {
      success: false,
      text: '',
      pages: 0,
      strategy: 'openai-failed',
      error: error.message
    };
  }
}

async function storeExtractedText(result: PdfProcessingResult, deliberationId: string, userId: string, fileName: string): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Split text into chunks (approximately 1000 characters each)
    const chunks = splitTextIntoChunks(result.text, 1000);
    
    console.log(`Storing ${chunks.length} text chunks...`);

    // Store each chunk in the agent_knowledge table
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const { error: insertError } = await supabase
        .from('agent_knowledge')
        .insert({
          agent_id: deliberationId, // Use deliberationId as agent_id for now
          title: `${fileName} - Chunk ${i + 1}`,
          content: chunk,
          source_file: fileName,
          chunk_index: i,
          total_chunks: chunks.length,
          processing_status: 'completed',
          file_reference: fileName,
          created_by: userId
        });

      if (insertError) {
        console.error(`Error storing chunk ${i + 1}:`, insertError);
        throw new Error(`Failed to store chunk ${i + 1}: ${insertError.message}`);
      }
    }

    console.log('All chunks stored successfully');

  } catch (error) {
    console.error('Error storing extracted text:', error);
    throw error;
  }
}

function splitTextIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}
