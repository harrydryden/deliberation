import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('=== QUERY EDGE FUNCTION CALLED ===')
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
    console.log('Query:', body.query)
    console.log('Agent ID:', body.agentId)

    // Check required fields
    if (!body.query || !body.agentId) {
      console.log('Missing required fields')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing query or agentId' 
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
        response: 'Test query response - processing disabled for debugging',
        knowledgeChunks: 1,
        relevantKnowledge: [{ title: 'Test', content: 'Test content', similarity: 0.9 }]
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('=== ERROR IN QUERY EDGE FUNCTION ===')
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

async function generateResponseWithKnowledge(query: string, knowledgeContext: string): Promise<string> {
  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return `Based on available knowledge: ${knowledgeContext.substring(0, 500)}...`
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a bill agent helping users understand policy documents. Use the following knowledge to answer the user's question. Be specific and reference the relevant information.

KNOWLEDGE CONTEXT:
${knowledgeContext}

USER QUESTION: ${query}

Please provide a comprehensive answer based on the knowledge above. If the knowledge doesn't contain relevant information, say so clearly.`
        }]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.content[0].text
    } else {
      const errorData = await response.text()
      console.error('Anthropic API error:', errorData)
      return `I found relevant information but encountered an error generating the response. Here's the raw knowledge: ${knowledgeContext.substring(0, 1000)}...`
    }
  } catch (error) {
    console.error('Error generating response:', error)
    return `I found relevant information: ${knowledgeContext.substring(0, 1000)}...`
  }
}