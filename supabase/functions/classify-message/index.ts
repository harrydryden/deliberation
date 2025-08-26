import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper function to get classification prompt from template system
async function getClassificationPrompt(supabase: any, content: string, deliberationContext: string, deliberationNotion: string): Promise<string> {
  try {
    // Try to get classification_prompt template
    const { data: template } = await supabase
      .from('prompt_templates')
      .select('template')
      .eq('prompt_type', 'classification_prompt')
      .eq('is_active', true)
      .eq('is_default', true)
      .single()

    if (template && template.template) {
      // Replace template variables
      return template.template
        .replace('{content}', content)
        .replace('{deliberationContext}', deliberationContext)
        .replace('{deliberationNotion}', deliberationNotion)
    }
  } catch (error) {
    console.log('Failed to fetch classification prompt template:', error)
  }

  // Fallback to hardcoded prompt
  return `Analyze this message from a democratic deliberation and extract the following information:

Message: "${content}"${deliberationContext}

Please respond with a JSON object containing:
1. "title": A concise, descriptive title (max 60 characters)
2. "keywords": An array of 3-5 relevant keywords
3. "nodeType": One of "issue", "position", or "argument" based on IBIS methodology
4. "confidence": A number between 0 and 1 indicating confidence in the classification
5. "description": A brief description explaining the classification
6. "stanceScore": A number between -1 and 1 indicating the stance relative to the deliberation topic (-1 = strongly against, 0 = neutral, 1 = strongly in favor)

IBIS Guidelines:
- "issue": Questions, problems, or topics to be discussed
- "position": Potential solutions, options, or answers to issues
- "argument": Supporting or opposing evidence for positions

Stance Analysis:
- Analyze the message's position relative to the deliberation's NOTION: "${deliberationNotion}"
- Consider the emotional tone, supporting/opposing language, and explicit positions taken
- Return a score between -1 (strongly opposing) and 1 (strongly supporting) with 0 being neutral
- Base the stance specifically on the deliberation's notion, not the general topic or sub-issues
- If no notion is provided, base it on the overall deliberation topic

Respond only with valid JSON.`
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { content, deliberationId } = await req.json()

    if (!content) {
      throw new Error('Message content is required')
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set')
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch deliberation context if deliberationId is provided
    let deliberationContext = ''
    let deliberationNotion = ''
    let hasExistingNodes = true
    
    if (deliberationId) {
      const { data: deliberation } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single()
      
      // Check if there are existing IBIS nodes
      const { data: existingNodes } = await supabase
        .from('ibis_nodes')
        .select('id')
        .eq('deliberation_id', deliberationId)
        .limit(1)
      
      hasExistingNodes = existingNodes && existingNodes.length > 0
      
      if (deliberation) {
        deliberationNotion = deliberation.notion || ''
        deliberationContext = `\n\nDeliberation Context:
Title: "${deliberation.title}"
Description: "${deliberation.description || 'No description provided'}"
Notion: "${deliberationNotion}"`
      }
    }

    // Get classification prompt from template system
    const prompt = await getClassificationPrompt(supabase, content, deliberationContext, deliberationNotion)

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        max_completion_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const openaiData = await response.json()
    const aiResponse = openaiData.choices[0].message.content

    console.log('AI Response:', aiResponse)

    // Parse the JSON response
    let classification
    try {
      console.log('Raw AI Response:', aiResponse)
      console.log('AI Response type:', typeof aiResponse)
      console.log('AI Response length:', aiResponse?.length)
      
      classification = JSON.parse(aiResponse)
      console.log('Parsed classification:', JSON.stringify(classification, null, 2))
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse)
      console.error('Parse error details:', parseError)
      throw new Error('Invalid AI response format')
    }

    // Map old response format to new format if needed
    if (classification.item_type && !classification.nodeType) {
      console.log('Mapping item_type to nodeType:', classification.item_type)
      // Map item_type values to nodeType values
      const typeMapping = {
        'proposal': 'position',
        'question': 'issue', 
        'statement': 'argument',
        'issue': 'issue',
        'position': 'position',
        'argument': 'argument'
      }
      classification.nodeType = typeMapping[classification.item_type] || 'issue'
    }

    // Map confidence_score to confidence if needed
    if (classification.confidence_score && !classification.confidence) {
      classification.confidence = classification.confidence_score
    }

    // Map stance_score to stanceScore if needed
    if (classification.stance_score && !classification.stanceScore) {
      classification.stanceScore = classification.stance_score
    }

    // Validate the response structure
    console.log('Final classification before validation:', JSON.stringify(classification, null, 2))
    console.log('Validation checks:', {
      hasTitle: !!classification.title,
      hasKeywords: !!classification.keywords,
      hasNodeType: !!classification.nodeType,
      hasConfidence: !!classification.confidence
    })
    
    if (!classification.title || !classification.keywords || !classification.nodeType || !classification.confidence) {
      console.error('Incomplete classification response:', classification)
      throw new Error('Incomplete classification response')
    }

    // Validate stance score if present
    if (classification.stanceScore !== undefined && (classification.stanceScore < -1 || classification.stanceScore > 1)) {
      console.warn('Stance score out of range, clamping to [-1, 1]')
      classification.stanceScore = Math.max(-1, Math.min(1, classification.stanceScore))
    }

    // Store or update keywords in the database
    const keywordIds = []
    for (const keyword of classification.keywords) {
      // Try to find existing keyword
      const { data: existingKeyword, error: selectError } = await supabase
        .from('keywords')
        .select('id')
        .eq('keyword', keyword.toLowerCase())
        .single()

      if (existingKeyword) {
        keywordIds.push(existingKeyword.id)
        // Get current usage count and increment it
        const { data: currentKeyword } = await supabase
          .from('keywords')
          .select('usage_count')
          .eq('id', existingKeyword.id)
          .single()
        
        const newUsageCount = (currentKeyword?.usage_count || 0) + 1
        await supabase
          .from('keywords')
          .update({ usage_count: newUsageCount })
          .eq('id', existingKeyword.id)
      } else {
        // Create new keyword
        const { data: newKeyword, error: insertError } = await supabase
          .from('keywords')
          .insert({
            keyword: keyword.toLowerCase(),
            category: 'deliberation',
            usage_count: 1
          })
          .select('id')
          .single()

        if (newKeyword) {
          keywordIds.push(newKeyword.id)
        }
      }
    }

    // If no IBIS nodes exist yet, suggest generating root issues
    let rootSuggestion = null
    if (!hasExistingNodes) {
      rootSuggestion = {
        message: "This deliberation has no IBIS nodes yet. Consider generating initial root issues to structure the discussion.",
        action: "generateRootIssues"
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        classification: {
          ...classification,
          keywordIds
        },
        rootSuggestion
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in classify-message function:', error)
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