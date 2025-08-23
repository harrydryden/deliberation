import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// Import pdf-parse for sophisticated PDF processing
import pdf from 'https://esm.sh/pdf-parse@1.1.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Sophisticated PDF processing request received');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { pdfBase64, fileName, agentId } = await req.json();
    
    if (!pdfBase64 || !fileName || !agentId) {
      console.error('Missing required parameters');
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: pdfBase64, fileName, agentId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing PDF: ${fileName} for agent: ${agentId}`);
    
    // Convert base64 to buffer for pdf-parse
    const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    console.log(`PDF size: ${pdfBuffer.length} bytes`);
    
    let extractedText = '';
    let metadata = {};
    
    try {
      console.log('Starting PDF parsing with pdf-parse...');
      
      // Use pdf-parse for sophisticated PDF text extraction
      const data = await pdf(pdfBuffer, {
        // Advanced options for better text extraction
        max: 0, // Parse all pages
        version: 'v1.10.100', // Use specific PDF.js version
        normalizeWhitespace: true, // Normalize whitespace
        disableCombineTextItems: false, // Keep text items combined for better readability
      });
      
      extractedText = data.text || '';
      metadata = {
        numPages: data.numpages || 0,
        info: data.info || {},
        version: data.version || 'unknown',
        textLength: extractedText.length
      };
      
      console.log(`Successfully extracted ${extractedText.length} characters from ${metadata.numPages} pages`);
      
      // Clean up the extracted text
      extractedText = extractedText
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive blank lines
        .replace(/\s+/g, ' ') // Normalize whitespace but preserve structure
        .trim();
      
      if (!extractedText || extractedText.length < 50) {
        throw new Error('Insufficient text content extracted from PDF');
      }
      
    } catch (error) {
      console.error('PDF parsing error:', error);
      
      // If pdf-parse fails, provide detailed error info
      return new Response(
        JSON.stringify({ 
          error: `PDF parsing failed: ${error.message}`,
          details: 'The PDF may be corrupted, password-protected, or contain only images. Try converting to text first.',
          fileName: fileName
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Calling process-agent-knowledge function with extracted content...');
    
    // Enhance the content with metadata for better context
    const enhancedContent = `Document: ${fileName}
Pages: ${metadata.numPages}
Extracted Content:

${extractedText}`;
    
    // Call the existing process-agent-knowledge function with the extracted text
    const { data: processResult, error: processError } = await supabase.functions.invoke(
      'process-agent-knowledge',
      {
        body: {
          fileContent: enhancedContent,
          fileName: fileName,
          agentId: agentId,
          contentType: 'text/plain'
        }
      }
    );

    if (processError) {
      console.error('Process agent knowledge error:', processError);
      throw new Error(`Knowledge processing failed: ${processError.message}`);
    }

    console.log('PDF processing completed successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        chunksProcessed: processResult?.chunksProcessed || 0,
        extractedTextLength: extractedText.length,
        pdfMetadata: metadata,
        message: `Successfully processed PDF with ${metadata.numPages} pages and ${extractedText.length} characters`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('PDF processing error:', error);
    return new Response(
      JSON.stringify({ error: `PDF processing failed: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});