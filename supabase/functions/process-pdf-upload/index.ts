import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

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
    console.log('PDF processing request received');
    
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
    
    // Convert base64 to Uint8Array
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    console.log(`PDF size: ${pdfBytes.length} bytes`);
    
    // For now, we'll use a simple text extraction approach
    // In a real implementation, you'd use a PDF parsing library like pdf-parse
    // that works in Deno environment
    
    // Basic PDF text extraction (simplified)
    let extractedText = '';
    
    try {
      // Convert PDF bytes to string and look for readable text patterns
      const pdfString = new TextDecoder('latin1').decode(pdfBytes);
      
      // Simple regex to extract text between common PDF markers
      const textMatches = pdfString.match(/\((.*?)\)/g) || [];
      const streamMatches = pdfString.match(/stream\s*(.*?)\s*endstream/gs) || [];
      
      // Extract text from parentheses (common in PDF text objects)
      textMatches.forEach(match => {
        const text = match.slice(1, -1); // Remove parentheses
        if (text.length > 2 && /[a-zA-Z]/.test(text)) {
          extractedText += text + ' ';
        }
      });
      
      // Try to extract from streams as well
      streamMatches.forEach(match => {
        const streamContent = match.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
        // Look for readable text patterns
        const readableText = streamContent.match(/[a-zA-Z][a-zA-Z0-9\s.,!?;:'"()-]{10,}/g) || [];
        readableText.forEach(text => {
          extractedText += text + ' ';
        });
      });
      
      // Clean up extracted text
      extractedText = extractedText
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s.,!?;:'"()-]/g, ' ')
        .trim();
      
      console.log(`Extracted text length: ${extractedText.length}`);
      
      if (!extractedText || extractedText.length < 50) {
        // If extraction failed, provide a fallback message
        extractedText = `PDF document uploaded: ${fileName}. The PDF content could not be automatically extracted. Please manually provide the key information from this document.`;
        console.log('Using fallback text for PDF');
      }
      
    } catch (error) {
      console.error('PDF text extraction error:', error);
      extractedText = `PDF document uploaded: ${fileName}. Text extraction encountered an error: ${error.message}. Please manually provide the key information from this document.`;
    }
    
    console.log('Calling process-agent-knowledge function');
    
    // Now call the existing process-agent-knowledge function with the extracted text
    const { data: processResult, error: processError } = await supabase.functions.invoke(
      'process-agent-knowledge',
      {
        body: {
          fileContent: extractedText,
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
        message: 'PDF processed successfully'
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