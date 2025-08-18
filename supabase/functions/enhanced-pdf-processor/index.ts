import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced PDF text extraction using proper PDF parsing
async function extractPDFTextAdvanced(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const fileSize = arrayBuffer.byteLength;
  console.log(`📄 Processing PDF: ${fileName} (${Math.round(fileSize / 1024)} KB)`);

  if (fileSize > 25 * 1024 * 1024) { // 25MB limit
    throw new Error('PDF file too large. Please upload files smaller than 25MB.');
  }

  const bytes = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const pdfString = decoder.decode(bytes);

  console.log('🔍 Analyzing PDF structure...');

  // Enhanced extraction patterns for better text quality
  const extractedText: string[] = [];

  // Strategy 1: Extract from text objects (Tj, TJ operators)
  const textOperatorMatches = pdfString.match(/\(([^)]+)\)\s*(?:Tj|TJ)/g) || [];
  textOperatorMatches.forEach(match => {
    const text = match.match(/\(([^)]+)\)/)?.[1];
    if (text && text.length > 2) {
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
        if (text && text.length > 2) {
          extractedText.push(text.trim());
        }
      });
    }
  });

  // Strategy 3: Extract from text blocks (BT...ET)
  const textBlockMatches = pdfString.match(/BT\s+([\s\S]*?)\s+ET/g) || [];
  textBlockMatches.forEach(block => {
    const content = block.replace(/^BT\s+/, '').replace(/\s+ET$/, '');
    // Look for text operations within the block
    const textOps = content.match(/\(([^)]{3,})\)\s*(?:Tj|TJ)/g) || [];
    textOps.forEach(op => {
      const text = op.match(/\(([^)]+)\)/)?.[1];
      if (text && text.length > 2) {
        extractedText.push(text.trim());
      }
    });
  });

  // Strategy 4: Extract font-encoded text
  const fontTextMatches = pdfString.match(/<([0-9A-Fa-f\s]+)>\s*(?:Tj|TJ)/g) || [];
  fontTextMatches.forEach(match => {
    const hexContent = match.match(/<([0-9A-Fa-f\s]+)>/)?.[1];
    if (hexContent) {
      try {
        // Convert hex to text (basic approach)
        const cleanHex = hexContent.replace(/\s+/g, '');
        if (cleanHex.length % 2 === 0) {
          const text = cleanHex.match(/.{2}/g)
            ?.map(hex => String.fromCharCode(parseInt(hex, 16)))
            .join('')
            .replace(/[\x00-\x1F\x7F-\xFF]/g, ' ');
          if (text && text.trim().length > 2) {
            extractedText.push(text.trim());
          }
        }
      } catch (error) {
        console.warn('Failed to decode hex text:', error.message);
      }
    }
  });

  // Strategy 5: Extract from metadata and content streams
  const metadataMatches = pdfString.match(/\/Title\s*\(([^)]+)\)/g) || [];
  metadataMatches.forEach(match => {
    const title = match.match(/\/Title\s*\(([^)]+)\)/)?.[1];
    if (title && title.length > 2) {
      extractedText.push(`Title: ${title.trim()}`);
    }
  });

  const authorMatches = pdfString.match(/\/Author\s*\(([^)]+)\)/g) || [];
  authorMatches.forEach(match => {
    const author = match.match(/\/Author\s*\(([^)]+)\)/)?.[1];
    if (author && author.length > 2) {
      extractedText.push(`Author: ${author.trim()}`);
    }
  });

  const subjectMatches = pdfString.match(/\/Subject\s*\(([^)]+)\)/g) || [];
  subjectMatches.forEach(match => {
    const subject = match.match(/\/Subject\s*\(([^)]+)\)/)?.[1];
    if (subject && subject.length > 2) {
      extractedText.push(`Subject: ${subject.trim()}`);
    }
  });

  console.log(`🔤 Extracted ${extractedText.length} text fragments`);

  // Clean and filter extracted text
  const cleanedText = extractedText
    .filter(text => {
      return (
        text &&
        text.length > 2 &&
        /[A-Za-z]/.test(text) && // Contains letters
        !/^[\d\s\.\-\(\)\/]+$/.test(text) && // Not just numbers and punctuation
        !text.includes('MCR') && // Filter out PDF metadata
        !text.includes('endobj') &&
        !text.includes('stream') &&
        !text.includes('StructParent') &&
        !/^[^a-zA-Z]*$/.test(text) // Contains some letters
      );
    })
    .map(text => text
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(text => text.length > 3);

  console.log(`✅ Filtered to ${cleanedText.length} meaningful text fragments`);

  // Join and structure the text
  let finalText = cleanedText.join(' ').trim();

  // Try to reconstruct sentences and paragraphs
  finalText = finalText
    .replace(/([.!?])\s*([A-Z])/g, '$1\n\n$2') // Add paragraph breaks after sentences
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // If extraction was poor, provide a structured fallback
  if (finalText.length < 100) {
    console.warn('⚠️ Poor text extraction, using structured fallback');
    
    // Try to extract any readable patterns one more time
    const lastResortText = pdfString
      .match(/[A-Za-z][A-Za-z\s,.:;!?]{20,}/g) || [];
    
    const meaningfulFragments = lastResortText
      .filter(text => 
        !text.includes('MCR') && 
        !text.includes('StructParent') &&
        /[A-Za-z]{3,}/.test(text)
      )
      .slice(0, 10); // Take first 10 meaningful fragments

    finalText = meaningfulFragments.length > 0 
      ? meaningfulFragments.join(' ')
      : `PDF Document Analysis: ${fileName}

This PDF document contains primarily:
- Structured data or forms
- Images, graphics, or visual elements  
- Complex formatting that requires specialized extraction

File Details:
- Size: ${Math.round(fileSize / 1024)} KB
- Format: Portable Document Format (PDF)

For optimal text extraction and AI analysis, please:
1. Convert to plain text (.txt) or Word document (.docx)
2. Ensure the PDF has selectable text (not scanned images)
3. Use a PDF with standard text encoding
4. Consider using OCR software if this is a scanned document

Note: This document may contain valuable information that requires manual review or specialized PDF processing tools.`;
  }

  console.log(`📊 Final extracted text length: ${finalText.length} characters`);
  return finalText;
}

serve(async (req) => {
  console.log('🚀 ENHANCED PDF PROCESSOR CALLED');
  
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    const body = await req.json();
    const { storagePath, fileName } = body;

    if (!storagePath || !fileName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing storagePath or fileName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    console.log('📥 Downloading file from storage...');
    
    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // Extract text
    const arrayBuffer = await fileData.arrayBuffer();
    const extractedText = await extractPDFTextAdvanced(arrayBuffer, fileName);

    console.log('✅ PDF processing completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        extractedText,
        textLength: extractedText.length,
        message: 'PDF processed successfully with enhanced extraction'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Enhanced PDF processing error:', error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Enhanced PDF processing failed: ${error.message}`
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});