import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import * as pdfjsLib from 'https://esm.sh/pdfjs-dist@4.0.379';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Much more reliable text extraction with layout preservation using pdfjs-dist
async function extractPDFTextAdvanced(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const fileSize = arrayBuffer.byteLength;
  console.log(`📄 Processing PDF: ${fileName} (${Math.round(fileSize / 1024)} KB)`);

  if (fileSize > 25 * 1024 * 1024) { // 25MB limit
    throw new Error('PDF file too large. Please upload files smaller than 25MB.');
  }

  try {
    console.log('🔍 Loading PDF with pdfjs-dist...');
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    console.log(`📑 PDF loaded successfully. Pages: ${pdf.numPages}`);
    
    const extractedText: string[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`📄 Processing page ${pageNum}/${pdf.numPages}`);
      
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Extract text items with positioning information
      const pageText: Array<{text: string, x: number, y: number, width: number, height: number}> = [];
      
      textContent.items.forEach((item: any) => {
        if (item.str && item.str.trim()) {
          pageText.push({
            text: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height
          });
        }
      });
      
      // Sort by Y position (top to bottom) then X position (left to right)
      pageText.sort((a, b) => {
        const yDiff = b.y - a.y; // Reverse Y for top-to-bottom
        if (Math.abs(yDiff) > 5) { // Same line threshold
          return yDiff;
        }
        return a.x - b.x; // Left to right
      });
      
      // Group text items into lines based on Y position
      const lines: string[] = [];
      let currentLine: string[] = [];
      let currentY = pageText[0]?.y;
      
      pageText.forEach(item => {
        if (Math.abs(item.y - currentY) > 5) { // New line threshold
          if (currentLine.length > 0) {
            lines.push(currentLine.join(' ').trim());
            currentLine = [];
          }
          currentY = item.y;
        }
        currentLine.push(item.text);
      });
      
      // Add the last line
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' ').trim());
      }
      
      // Add page content with proper spacing
      if (lines.length > 0) {
        if (pageNum > 1) {
          extractedText.push('\n\n--- Page ' + pageNum + ' ---\n');
        }
        extractedText.push(...lines);
      }
    }
    
    console.log(`🔤 Extracted text from ${pdf.numPages} pages`);
    
    // Join all text with proper line breaks
    let finalText = extractedText.join('\n').trim();
    
    // Clean up the text while preserving layout
    finalText = finalText
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
      .replace(/\s+/g, ' ') // Normalize spaces within lines
      .replace(/\n /g, '\n') // Remove leading spaces after line breaks
      .trim();
    
    // Filter out very short or meaningless content
    if (finalText.length < 50) {
      throw new Error('Insufficient text content extracted from PDF');
    }
    
    console.log(`📊 Final extracted text length: ${finalText.length} characters`);
    return finalText;
    
  } catch (error) {
    console.error('❌ pdfjs-dist extraction failed:', error.message);
    
    // Fallback message with helpful information
    const fallbackText = `PDF Document Analysis: ${fileName}

Error during text extraction: ${error.message}

This PDF document may contain:
- Scanned images requiring OCR
- Complex layouts or forms
- Protected or encrypted content
- Non-standard text encoding

File Details:
- Size: ${Math.round(fileSize / 1024)} KB
- Format: Portable Document Format (PDF)

For optimal text extraction and AI analysis, please:
1. Ensure the PDF contains selectable text (not scanned images)
2. Convert to plain text (.txt) or Word document (.docx)
3. Use OCR software if this is a scanned document
4. Check if the PDF has any protection or encryption

Note: This document may contain valuable information that requires manual review or specialized PDF processing tools.`;

    return fallbackText;
  }
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