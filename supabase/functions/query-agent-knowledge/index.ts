import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

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

    // Use the existing match_agent_knowledge function with a very lenient threshold
    console.log('Calling match_agent_knowledge with threshold 0.1...')
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

    // Analyze query complexity and type
    const queryAnalysis = analyzeQuery(query)
    
    // Generate enhanced knowledge context with metadata
    const knowledgeContext = formatKnowledgeForAnalysis(matchResults, queryAnalysis)

    console.log('Generating AI response...')
    const openaiResponse = await generateResponseWithKnowledge(query, knowledgeContext, queryAnalysis)

    return new Response(
      JSON.stringify({ 
        success: true,
        response: openaiResponse,
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

function analyzeQuery(query: string) {
  const queryLower = query.toLowerCase()
  const words = queryLower.split(/\s+/)
  
  // Detect question types
  const isDefinitional = /^(what is|define|explain|describe)/.test(queryLower)
  const isComparative = /(compare|versus|vs|difference|similar|different)/.test(queryLower)
  const isAnalytical = /(why|how|impact|effect|consequence|implication|analysis|evaluate)/.test(queryLower)
  const isSpecific = /(section|clause|article|paragraph|line|page)/.test(queryLower)
  const isRelational = /(relate|connect|link|association|relationship)/.test(queryLower)
  
  // Detect complexity indicators
  const hasMultipleConcepts = words.length > 8
  const hasComplexTerms = /(implementation|stakeholder|framework|methodology|compliance)/.test(queryLower)
  
  return {
    type: isDefinitional ? 'definitional' : 
          isComparative ? 'comparative' :
          isAnalytical ? 'analytical' :
          isSpecific ? 'specific' :
          isRelational ? 'relational' : 'general',
    complexity: hasMultipleConcepts || hasComplexTerms ? 'high' : 
                isAnalytical || isComparative ? 'medium' : 'low',
    isDefinitional,
    isComparative,
    isAnalytical,
    isSpecific,
    isRelational
  }
}

function formatKnowledgeForAnalysis(matchResults: any[], queryAnalysis: any): string {
  if (!matchResults || matchResults.length === 0) {
    return 'No relevant knowledge found in the uploaded documents.'
  }

  // Group similar content and provide richer context
  const formattedChunks = matchResults.map((item, index) => {
    const relevanceLevel = item.similarity > 0.8 ? 'HIGH' : 
                          item.similarity > 0.6 ? 'MEDIUM' : 'LOW'
    
    return `KNOWLEDGE CHUNK ${index + 1} (Relevance: ${relevanceLevel} - ${item.similarity.toFixed(3)}):
DOCUMENT: ${item.title || 'Untitled'}
${item.file_name ? `SOURCE FILE: ${item.file_name}` : ''}
${item.chunk_index ? `SECTION: Part ${item.chunk_index + 1}` : ''}

CONTENT:
${item.content}

---`
  })

  // Add synthesis instruction based on query type
  let synthesisPrompt = ''
  if (queryAnalysis.complexity === 'high' && matchResults.length > 1) {
    synthesisPrompt = '\n\nSYNTHESIS INSTRUCTION: Multiple relevant sections found. Please synthesize information across these sources to provide a comprehensive analysis.'
  }

  return formattedChunks.join('\n\n') + synthesisPrompt
}

function buildAnalyticalPrompt(query: string, knowledgeContext: string, queryAnalysis: any): string {
  const baseContext = `You are an expert policy analyst specializing in legislative documents and policy interpretation. Your role is to provide insightful, contextual analysis rather than simple factual recitation.`
  
  let analysisInstructions = ''
  
  switch (queryAnalysis.type) {
    case 'definitional':
      analysisInstructions = `
ANALYTICAL APPROACH: This is a definitional query. Beyond basic definition, provide:
- Context about why this concept matters in the policy framework
- Practical implications and applications
- Related concepts and how they interconnect
- Any nuances or complexities in interpretation`
      break
      
    case 'comparative':
      analysisInstructions = `
ANALYTICAL APPROACH: This is a comparative query. Provide:
- Clear comparison of the concepts/provisions
- Analysis of implications of differences
- Context about why these distinctions matter
- Practical impact of each approach`
      break
      
    case 'analytical':
      analysisInstructions = `
ANALYTICAL APPROACH: This requires deep analysis. Provide:
- Multi-layered examination of causes, effects, and implications
- Consider stakeholder perspectives and impacts
- Identify potential unintended consequences
- Connect to broader policy objectives and context`
      break
      
    case 'relational':
      analysisInstructions = `
ANALYTICAL APPROACH: This asks about relationships. Provide:
- Map the connections between concepts/provisions
- Explain the nature and strength of relationships
- Analyze how changes in one area might affect others
- Consider systemic implications`
      break
      
    case 'specific':
      analysisInstructions = `
ANALYTICAL APPROACH: This targets specific content. Provide:
- The specific information requested
- Context around why this provision exists
- How it fits into the broader document structure
- Practical application and interpretation guidance`
      break
      
    default:
      analysisInstructions = `
ANALYTICAL APPROACH: Provide comprehensive analysis including:
- Core information with contextual interpretation
- Relevant implications and applications
- Connections to related concepts
- Practical significance`
  }

  const complexityInstructions = queryAnalysis.complexity === 'high' 
    ? '\n\nCOMPLEXITY NOTE: This is a complex query requiring synthesis across multiple concepts. Ensure your response integrates information from multiple sources where available and addresses the multifaceted nature of the question.'
    : queryAnalysis.complexity === 'medium'
    ? '\n\nCOMPLEXITY NOTE: This requires moderate analysis. Balance comprehensive coverage with clear, focused insights.'
    : '\n\nCOMPLEXITY NOTE: Provide clear, direct response while including relevant analytical context.'

  return `${baseContext}

${analysisInstructions}

${complexityInstructions}

KNOWLEDGE BASE:
${knowledgeContext}

USER QUESTION: ${query}

RESPONSE REQUIREMENTS:
1. Lead with direct insight, not just facts
2. Synthesize information across sources when multiple chunks are provided
3. Provide contextual interpretation that helps users understand significance
4. Include practical implications where relevant
5. If knowledge is insufficient, be specific about what's missing and suggest what additional information would be helpful
6. Maintain authoritative but accessible tone

Generate your analytical response:`
}

async function generateResponseWithKnowledge(query: string, knowledgeContext: string, queryAnalysis: any): Promise<string> {
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return `Based on available knowledge: ${knowledgeContext.substring(0, 500)}...`
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        max_completion_tokens: 1000,
        messages: [{
          role: 'user',
          content: buildAnalyticalPrompt(query, knowledgeContext, queryAnalysis)
        }]
      })
    })

    console.log('🤖 Calling OpenAI for response generation...');

    if (response.ok) {
      const data = await response.json()
      console.log('✅ OpenAI response successful');
      const responseContent = data.choices[0].message.content;
      console.log('📝 Generated response length:', responseContent?.length || 0);
      return responseContent;
    } else {
      const errorData = await response.text()
      console.error('❌ OpenAI API error status:', response.status);
      console.error('❌ OpenAI API error:', errorData)
      return `I found relevant information but encountered an error generating the response. Here's the raw knowledge: ${knowledgeContext.substring(0, 1000)}...`
    }
  } catch (error) {
    console.error('💥 Error generating response:', error)
    return `I found relevant information: ${knowledgeContext.substring(0, 1000)}...`
  }
}
