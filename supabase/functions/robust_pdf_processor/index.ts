import { serve } from "std/http/server.ts";
import { createClient } from '@supabase/supabase-js';

// Inlined utilities to avoid cross-folder import issues
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] ${context || 'Edge Function'} Error:`, error);
  
  return new Response(
    JSON.stringify({
      error: error?.message || 'An unexpected error occurred',
      errorId,
      context,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    return body as T;
  } catch (error: any) {
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}

function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    userSupabase: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
  };
}

const EdgeLogger = {
  debug: (message: string, data?: any) => console.log(`🔍 ${message}`, data),
  info: (message: string, data?: any) => console.log(`ℹ️ ${message}`, data),
  error: (message: string, error?: any) => console.error(`❌ ${message}`, error),
};

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
  EdgeLogger.debug('PDF Processor function called', { method: req.method, url: req.url });
  
  // Handle CORS preflight requests
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.debug('Processing PDF extraction request');
    
    // Validate environment and get clients
    const { supabase, userSupabase } = validateAndGetEnvironment();
    
    // Verify JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      EdgeLogger.error('No authorization header provided');
      throw new Error('No authorization header');
    }

    // Create client with user token
    const supabaseClient = userSupabase;
    // Set the auth header for the request
    supabaseClient.auth.setSession = null; // Reset any existing session
    
    // Verify the user using the provided token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      throw new Error('Invalid authentication');
    }

    console.log('User authenticated:', user.id);

    const { fileUrl, fileName, deliberationId, userId }: PdfProcessingRequest = await parseAndValidateRequest<PdfProcessingRequest>(
      req,
      ['fileUrl', 'fileName', 'deliberationId', 'userId']
    );


    // Validate that fileUrl is a complete URL
    if (!fileUrl.startsWith('http')) {
      console.error('Invalid fileUrl format - expected complete URL, got:', fileUrl);
      throw new Error(`Invalid fileUrl format: expected complete URL starting with 'http', got: ${fileUrl}`);
    }

    console.log('Starting PDF processing for:', fileName);
    console.log('Using fileUrl:', fileUrl);

    // Process the PDF with multiple strategies
    const result = await processPdfWithMultipleStrategies(fileUrl, fileName);

    if (result.success) {
      console.log('PDF processing successful, storing in knowledge base...');
      try {
        // Store the extracted text in the knowledge base
        await storeExtractedText(result, deliberationId, userId, fileName, supabase);
        console.log('Knowledge chunks stored successfully');
      } catch (storageError) {
        console.error('Failed to store knowledge chunks:', storageError);
        // Return the extraction result but indicate storage failed
        result.error = `Text extraction succeeded but storage failed: ${storageError.message}`;
        result.metadata = {
          ...result.metadata,
          storageError: storageError.message,
          storageFailed: true
        };
      }
    } else {
      console.warn('PDF processing failed:', result.error);
    }

    return createSuccessResponse(result);

  } catch (error) {
    console.error('PDF Processing Error:', error);
    return createErrorResponse(error, 500, 'PDF processing');
  }
});

async function processPdfWithMultipleStrategies(fileUrl: string, fileName: string): Promise<PdfProcessingResult> {
  const strategies = [
    { name: 'pdfjs', fn: extractWithPdfJs },
    { name: 'enhanced-regex', fn: extractWithEnhancedRegex },
    { name: 'binary-analysis', fn: extractWithBinaryAnalysis },
    { name: 'fallback-text', fn: extractWithFallbackText }
  ];

  for (const strategy of strategies) {
    try {
      console.log(`Attempting PDF extraction with strategy: ${strategy.name}`);
      const result = await strategy.fn(fileUrl, fileName);
      
      if (result.success && result.text.trim().length > 100) {
        console.log(`Successfully extracted text using ${strategy.name} strategy`);
        return { ...result, strategy: strategy.name };
      }
    } catch (error) {
      console.warn(`Strategy ${strategy.name} failed:`, error.message);
      continue;
    }
  }

  // All strategies failed
  return {
    success: false,
    text: '',
    pages: 0,
    strategy: 'all-failed',
    error: 'All PDF extraction strategies failed'
  };
}

async function extractWithPdfJs(fileUrl: string, fileName: string): Promise<PdfProcessingResult> {
  try {
    // Download the PDF file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Load PDF.js library
    const pdfjsLib = await import('pdfjs-dist');
    
    // Configure PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.js';

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    let extractedText = '';
    const totalPages = pdf.numPages;

    // Extract text from each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      extractedText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
    }

    return {
      success: true,
      text: extractedText.trim(),
      pages: totalPages,
      strategy: 'pdfjs',
      metadata: {
        fileName,
        extractionMethod: 'PDF.js',
        totalPages,
        textLength: extractedText.length
      }
    };

  } catch (error) {
    console.error('PDF.js extraction failed:', error);
    throw error;
  }
}

async function extractWithEnhancedRegex(fileUrl: string, fileName: string): Promise<PdfProcessingResult> {
  try {
    // Download the PDF file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to text using enhanced regex patterns
    const textDecoder = new TextDecoder('utf-8');
    let pdfText = textDecoder.decode(uint8Array);

    // Enhanced text extraction patterns
    const patterns = [
      // Extract text between common PDF markers
      /\/Text\s*<<[^>]*>>\s*stream\s*([\s\S]*?)\s*endstream/gi,
      // Extract text from content streams
      /BT\s*([\s\S]*?)\s*ET/gi,
      // Extract text from text objects
      /Tj\s*\(([^)]*)\)/gi,
      // Extract text from text arrays
      /TJ\s*\[([^\]]*)\]/gi,
      // Look for readable text patterns
      /[A-Za-z0-9\s.,!?;:'"()[\]{}]+/g
    ];

    let extractedText = '';
    let pageCount = 0;

    for (const pattern of patterns) {
      const matches = pdfText.match(pattern);
      if (matches) {
        extractedText += matches.join(' ') + ' ';
        pageCount = Math.max(pageCount, matches.length);
      }
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:'"()[\]{}]/g, '')
      .trim();

    if (extractedText.length < 50) {
      throw new Error('Insufficient text extracted with regex');
    }

    return {
      success: true,
      text: extractedText,
      pages: pageCount || 1,
      strategy: 'enhanced-regex',
      metadata: {
        fileName,
        extractionMethod: 'Enhanced Regex',
        patternsUsed: patterns.length,
        textLength: extractedText.length
      }
    };

  } catch (error) {
    console.error('Enhanced regex extraction failed:', error);
    throw error;
  }
}

async function extractWithBinaryAnalysis(fileUrl: string, fileName: string): Promise<PdfProcessingResult> {
  try {
    // Download the PDF file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Binary analysis for PDF structure
    let extractedText = '';
    let pageCount = 0;

    // Look for PDF text markers in binary data
    const textMarkers = [
      'BT', 'ET', 'Tj', 'TJ', 'Td', 'Tm', 'Tc', 'Tw', 'Tz', 'TL'
    ];

    // Convert binary data to string for pattern matching
    const binaryString = String.fromCharCode.apply(null, Array.from(uint8Array));
    
    for (const marker of textMarkers) {
      const regex = new RegExp(`${marker}\\s*([^\\s]+)`, 'gi');
      const matches = binaryString.match(regex);
      if (matches) {
        extractedText += matches.join(' ') + ' ';
        pageCount++;
      }
    }

    // Look for readable text sequences
    const readablePattern = /[A-Za-z0-9\s]{10,}/g;
    const readableMatches = binaryString.match(readablePattern);
    if (readableMatches) {
      extractedText += readableMatches.join(' ') + ' ';
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:'"()[\]{}]/g, '')
      .trim();

    if (extractedText.length < 30) {
      throw new Error('Insufficient text extracted with binary analysis');
    }

    return {
      success: true,
      text: extractedText,
      pages: pageCount || 1,
      strategy: 'binary-analysis',
      metadata: {
        fileName,
        extractionMethod: 'Binary Analysis',
        textMarkersFound: textMarkers.filter(marker => 
          binaryString.includes(marker)
        ).length,
        textLength: extractedText.length
      }
    };

  } catch (error) {
    console.error('Binary analysis extraction failed:', error);
    throw error;
  }
}

async function extractWithFallbackText(fileUrl: string, fileName: string): Promise<PdfProcessingResult> {
  try {
    // Download the PDF file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Last resort: try to extract any readable text
    const textDecoder = new TextDecoder('utf-8');
    let pdfText = textDecoder.decode(uint8Array);

    // Remove PDF-specific syntax and keep readable text
    const cleanText = pdfText
      .replace(/\/[A-Za-z]+\s*/g, ' ') // Remove PDF commands
      .replace(/\[[^\]]*\]/g, ' ') // Remove arrays
      .replace(/<<[^>]*>>/g, ' ') // Remove dictionaries
      .replace(/[^\w\s.,!?;:'"()[\]{}]/g, ' ') // Keep only readable characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (cleanText.length < 20) {
      throw new Error('No readable text found in PDF');
    }

    return {
      success: true,
      text: cleanText,
      pages: 1,
      strategy: 'fallback-text',
      metadata: {
        fileName,
        extractionMethod: 'Fallback Text',
        originalLength: pdfText.length,
        cleanedLength: cleanText.length
      }
    };

  } catch (error) {
    console.error('Fallback text extraction failed:', error);
    throw error;
  }
}

async function storeExtractedText(
  result: PdfProcessingResult, 
  deliberationId: string, 
  userId: string, 
  fileName: string,
  supabaseClient: any
): Promise<void> {
  try {

    // Create knowledge chunks from the extracted text
    const chunks = createKnowledgeChunks(result.text, fileName);
    
    console.log(`Creating ${chunks.length} knowledge chunks for ${fileName}`);
    
    // Store chunks in the agent_knowledge table
    for (const chunk of chunks) {
      const { error: insertError } = await supabaseClient
        .from('agent_knowledge')
        .insert({
          agent_id: deliberationId, // Use deliberationId as agent_id
          title: `${fileName} - Chunk ${chunk.index + 1}`,
          content: chunk.content,
          content_type: 'text',
          file_name: fileName,
          chunk_index: chunk.index,
          metadata: {
            ...result.metadata,
            fileName,
            deliberationId,
            userId,
            extractionStrategy: result.strategy,
            originalPages: result.pages,
            chunkIndex: chunk.index,
            totalChunks: chunks.length
          },
          created_by: userId
        });

      if (insertError) {
        console.error(`Failed to insert chunk ${chunk.index + 1}:`, insertError);
        throw new Error(`Failed to insert chunk ${chunk.index + 1}: ${insertError.message}`);
      }
    }

    console.log(`Successfully stored ${chunks.length} knowledge chunks for ${fileName}`);

  } catch (error) {
    console.error('Failed to store extracted text:', error);
    throw error; // Re-throw to handle the error in the main function
  }
}

function createKnowledgeChunks(text: string, fileName: string): Array<{ content: string; index: number }> {
  const maxChunkSize = 1000; // Maximum characters per chunk
  const overlap = 200; // Overlap between chunks for context
  
  const chunks: Array<{ content: string; index: number }> = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    
    // Try to break at sentence boundaries
    if (endIndex < text.length) {
      const nextPeriod = text.indexOf('.', endIndex - 100);
      const nextNewline = text.indexOf('\n', endIndex - 100);
      
      if (nextPeriod > 0 && nextPeriod < endIndex + 100) {
        endIndex = nextPeriod + 1;
      } else if (nextNewline > 0 && nextNewline < endIndex + 100) {
        endIndex = nextNewline + 1;
      }
    }

    const chunkContent = text.substring(startIndex, endIndex).trim();
    
    if (chunkContent.length > 50) { // Only add chunks with substantial content
      chunks.push({
        content: chunkContent,
        index: chunkIndex
      });
      chunkIndex++;
    }

    startIndex = endIndex - overlap;
    if (startIndex >= text.length) break;
  }

  return chunks;
}
