import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://iowsxuxkgvpgrvvklwyt.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0IiwiZXhwIjoyMDY4ODc2MDk2fQ.VLD-yck9_WrJjFanhnMZ5MzQcKv_zkfOJ7e5L1dS2Ck';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Validate required environment variables
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is not set');
  throw new Error('OPENAI_API_KEY environment variable is required');
}

// Debug: Log available environment variables
console.log('Available environment variables:', {
  SUPABASE_URL: SUPABASE_URL ? 'SET' : 'NOT SET',
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
  SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET',
  OPENAI_API_KEY: OPENAI_API_KEY ? 'SET' : 'NOT SET'
});

// Debug: Log all environment variable keys
const envKeys = [];
for (const [key, value] of Object.entries(Deno.env.toObject())) {
  if (key.includes('OPENAI') || key.includes('API') || key.includes('KEY')) {
    envKeys.push(key);
  }
}
console.log('Environment variables containing OPENAI/API/KEY:', envKeys);

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
  
  // Debug: Log environment variables at function start
  console.log('Function start - Environment check:', {
    OPENAI_API_KEY: OPENAI_API_KEY ? 'SET' : 'NOT SET',
    OPENAI_API_KEY_LENGTH: OPENAI_API_KEY ? OPENAI_API_KEY.length : 0
  });
  
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
    console.log('Processing PDF file:', fileName);
    console.log('File URL:', fileUrl);

    // Validate that the file URL is accessible
    try {
      const fileCheck = await fetch(fileUrl, { method: 'HEAD' });
      if (!fileCheck.ok) {
        throw new Error(`File not accessible: ${fileCheck.status} ${fileCheck.statusText}`);
      }
      console.log('File accessibility check passed');
    } catch (fileError) {
      console.error('File accessibility check failed:', fileError);
      throw new Error(`File accessibility check failed: ${fileError.message}`);
    }

    // Download the PDF file
    console.log('Downloading PDF file...');
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
    }
    
    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log('PDF downloaded, size:', pdfBuffer.byteLength, 'bytes');

    // For now, let's return a placeholder since we can't process PDFs directly
    // In a production environment, you would use a PDF processing library here
    console.log('PDF processing not yet implemented - returning placeholder');
    
    return {
      success: false,
      text: '',
      pages: 0,
      strategy: 'pdf-processing-not-implemented',
      error: 'PDF text extraction is not yet implemented. This function needs to be updated with a proper PDF processing library.'
    };

  } catch (error) {
    console.error('PDF processing failed:', error);
    return {
      success: false,
      text: '',
      pages: 0,
      strategy: 'pdf-failed',
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
