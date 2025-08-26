import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://iowsxuxkgvpgrvvklwyt.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDAwOTYsImV4cCI6MjA2ODg3NjA5Nn0.WSXdI12OCdcJ-3ktEjdY9G5wHzzmD-98kBlJxPg1yhM';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3N4dXhrZ3ZwZ3J2dmtsd3l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzMwMDA5NiwiZXhwIjoyMDY4ODc2MDk2fQ.VLD-yck9_WrJjFanhnMZ5MzQcKv_zkfOJ7e5L1dS2Ck';

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
  console.log('PDF Processor function called:', req.method, req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Processing PDF extraction request...');
    
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

    console.log('Starting PDF processing for:', fileName);
    console.log('Using fileUrl:', fileUrl);

    // Process the PDF with multiple strategies
    const result = await processPdfWithMultipleStrategies(fileUrl, fileName);

    if (result.success) {
      console.log('PDF processing successful, storing in knowledge base...');
      try {
        // Store the extracted text in the knowledge base
        await storeExtractedText(result, deliberationId, userId, fileName);
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

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('PDF Processing Error:', error);
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js';

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
  fileName: string
): Promise<void> {
  try {
    const supabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

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
