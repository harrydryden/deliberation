import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('=== QUERY EDGE FUNCTION CALLED ===')
  console.log('Method:', req.method)
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Returning CORS response')
      return new Response('ok', { headers: corsHeaders })
    }

    console.log('Processing POST request...')
    
    // Parse request body
    const body = await req.json()
    console.log('Query:', body.query)
    console.log('Agent ID:', body.agentId)

    const { query, agentId, maxResults = 5 } = body

    if (!query || !agentId) {
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // Validate that the agent is a local agent (not a global template)
    console.log('Validating agent type...')
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single()

    if (agentError) {
      console.error('Agent validation error:', agentError)
      throw new Error('Invalid agent ID')
    }

    if (!agentData.deliberation_id) {
      console.error('Attempted to query knowledge from global agent:', agentId)
      throw new Error('Knowledge queries are only available for local agents (specific to deliberations), not global template agents')
    }

    console.log('Agent validation passed - local agent confirmed')

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured')
      throw new Error('Service configuration error')
    }

    console.log('Generating embedding for query...')
    
    // Generate embedding for the query using OpenAI
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query
      })
    })

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI API error: ${embeddingResponse.statusText}`)
    }

    const embeddingData = await embeddingResponse.json()
    const embeddingVector = embeddingData.data[0].embedding

    console.log('Querying knowledge database...')

    // Use the existing match_agent_knowledge function with a more lenient threshold
    console.log('Calling match_agent_knowledge with threshold 0.3...')
    const { data: matchResults, error } = await supabase
      .rpc('match_agent_knowledge', {
        input_agent_id: agentId,
        query_embedding: embeddingVector,
        match_threshold: 0.3,
        match_count: maxResults
      })

    if (error) {
      console.error('Knowledge matching error:', error)
      throw new Error(`Failed to query knowledge: ${error.message}`)
    }

    console.log(`Found ${matchResults?.length || 0} relevant knowledge chunks`)

    // Generate response using Anthropic with the retrieved knowledge
    const knowledgeContext = matchResults
      ?.map(item => `Title: ${item.title}\nContent: ${item.content}\nSimilarity: ${item.similarity.toFixed(3)}`)
      .join('\n\n---\n\n') || 'No relevant knowledge found.'

    console.log('Generating AI response...')
    const anthropicResponse = await generateResponseWithKnowledge(query, knowledgeContext)

    return new Response(
      JSON.stringify({ 
        success: true,
        response: anthropicResponse,
        knowledgeChunks: matchResults?.length || 0,
        relevantKnowledge: matchResults || []
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('=== ERROR IN QUERY EDGE FUNCTION ===')
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Edge function error: ${error.message}`
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
