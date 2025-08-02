import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('=== EDGE FUNCTION CALLED ===')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Returning CORS response')
      return new Response('ok', { headers: corsHeaders })
    }

    console.log('Processing POST request...')
    
    // Parse request body
    const body = await req.json()
    console.log('Request body keys:', Object.keys(body))
    console.log('Agent ID:', body.agentId)
    console.log('File name:', body.fileName)
    console.log('Content type:', body.contentType)
    console.log('Content length:', body.fileContent?.length)

    // Check required fields
    if (!body.fileContent || !body.agentId) {
      console.log('Missing required fields')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing fileContent or agentId' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // For now, just return a success response without actually processing
    console.log('Returning success response')
    return new Response(
      JSON.stringify({ 
        success: true, 
        chunksProcessed: 1,
        message: 'Test response - processing disabled for debugging'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('=== ERROR IN EDGE FUNCTION ===')
    console.error('Error type:', typeof error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Edge function error: ${error.message}`,
        details: error.stack
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})