import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.3.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query, agentId, maxResults = 5 } = await req.json()

    if (!query || !agentId) {
      throw new Error('Query and agent ID are required')
    }

    console.log(`Querying knowledge for agent ${agentId}: ${query}`)

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Initialize Hugging Face for embeddings
    const hf = new HfInference(Deno.env.get('HUGGING_FACE_ACCESS_TOKEN'))

    // Generate embedding for the query
    const queryEmbedding = await hf.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: query
    })

    const embeddingVector = Array.isArray(queryEmbedding) ? queryEmbedding : Array.from(queryEmbedding)

    // Use the existing match_agent_knowledge function
    const { data: matchResults, error } = await supabase
      .rpc('match_agent_knowledge', {
        input_agent_id: agentId,
        query_embedding: embeddingVector,
        match_threshold: 0.1,
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
    console.error('Error querying agent knowledge:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
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