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

    // Create classification prompt
    const prompt = `Analyze this message from a democratic deliberation and extract the following information:

Message: "${content}"

Please respond with a JSON object containing:
1. "title": A concise, descriptive title (max 60 characters)
2. "keywords": An array of 3-5 relevant keywords
3. "nodeType": One of "issue", "position", or "argument" based on IBIS methodology
4. "confidence": A number between 0 and 1 indicating confidence in the classification
5. "description": A brief description explaining the classification

IBIS Guidelines:
- "issue": Questions, problems, or topics to be discussed
- "position": Potential solutions, options, or answers to issues
- "argument": Supporting or opposing evidence for positions

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

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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
        // Increment usage count
        await supabase
          .from('keywords')
          .update({ usage_count: supabase.raw('usage_count + 1') })
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