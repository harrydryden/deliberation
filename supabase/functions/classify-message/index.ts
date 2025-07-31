import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
    const { content, deliberationId } = await req.json()

    if (!content) {
      throw new Error('Message content is required')
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set')
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch deliberation context if deliberationId is provided
    let deliberationContext = ''
    let deliberationNotion = ''
    if (deliberationId) {
      const { data: deliberation } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single()
      
      if (deliberation) {
        deliberationNotion = deliberation.notion || ''
        deliberationContext = `\n\nDeliberation Context:
Title: "${deliberation.title}"
Description: "${deliberation.description || 'No description provided'}"
Notion: "${deliberationNotion}"`
      }
    }

    // Create classification prompt with stance analysis
    const prompt = `Analyze this message from a democratic deliberation and extract the following information:

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

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', errorText)
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const anthropicData = await response.json()
    const aiResponse = anthropicData.content[0].text

    console.log('AI Response:', aiResponse)

    // Parse the JSON response
    let classification
    try {
      classification = JSON.parse(aiResponse)
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse)
      throw new Error('Invalid AI response format')
    }

    // Validate the response structure
    if (!classification.title || !classification.keywords || !classification.nodeType || !classification.confidence) {
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

    return new Response(
      JSON.stringify({
        success: true,
        classification: {
          ...classification,
          keywordIds
        }
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