import "xhr";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StanceRequest {
  userId: string;
  deliberationId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, deliberationId }: StanceRequest = await req.json();

    console.log('[calculate_user_stance] Processing request', { userId, deliberationId });

    // Get deliberation details for context
    const { data: deliberation, error: deliberationError } = await supabase
      .from('deliberations')
      .select('title, description')
      .eq('id', deliberationId)
      .single();

    if (deliberationError || !deliberation) {
      throw new Error(`Deliberation not found: ${deliberationId}`);
    }

    // Get user's recent messages in this deliberation
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('deliberation_id', deliberationId)
      .eq('message_type', 'user')
      .order('created_at', { ascending: false })
      .limit(20);

    if (messagesError) {
      throw new Error(`Failed to fetch user messages: ${messagesError.message}`);
    }

    if (!messages || messages.length === 0) {
      console.log('[calculate_user_stance] No messages found for user');
      return new Response(JSON.stringify({ 
        stanceScore: 0,
        confidenceScore: 0.1,
        semanticAnalysis: {
          reason: 'No messages found',
          messageCount: 0
        }
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Combine recent messages for analysis
    const combinedContent = messages
      .map(m => m.content)
      .join(' ')
      .substring(0, 3000); // Limit for API

    console.log(`[calculate_user_stance] Analyzing ${messages.length} messages`);

    // Create AI prompt for stance analysis
    const systemPrompt = `You are a stance analyzer for deliberative discussions. 
Analyze the user's messages to determine their stance on the deliberation topic.

Stance Scale:
-1.0: Strongly negative/opposed
-0.5: Moderately negative/opposed  
 0.0: Neutral/balanced
+0.5: Moderately positive/supportive
+1.0: Strongly positive/supportive

Confidence Scale:
0.0: No confidence (unclear/insufficient data)
0.5: Moderate confidence 
1.0: High confidence (clear indicators)

Return JSON with:
{
  "stanceScore": number (-1.0 to 1.0),
  "confidenceScore": number (0.0 to 1.0),
  "reasoning": "brief explanation",
  "keyThemes": ["theme1", "theme2"]
}`;

    const userPrompt = `Deliberation Topic: "${deliberation.title}"
Description: "${deliberation.description || 'No description provided'}"

User Messages:
${combinedContent}

Analyze the user's stance and return JSON:`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[calculate_user_stance] OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const result = await openaiResponse.json();
    const aiResponse = result.choices[0].message.content;

    console.log('[calculate_user_stance] AI response:', aiResponse);

    // Parse the JSON response
    let analysis;
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('[calculate_user_stance] Failed to parse AI response:', parseError);
      // Fallback to neutral stance
      analysis = {
        stanceScore: 0,
        confidenceScore: 0.1,
        reasoning: 'Failed to parse AI analysis',
        keyThemes: []
      };
    }

    // Validate and clamp values
    const stanceScore = Math.max(-1, Math.min(1, analysis.stanceScore || 0));
    const confidenceScore = Math.max(0, Math.min(1, analysis.confidenceScore || 0.1));

    const semanticAnalysis = {
      reasoning: analysis.reasoning || 'No reasoning provided',
      keyThemes: analysis.keyThemes || [],
      messageCount: messages.length,
      analysisTimestamp: new Date().toISOString()
    };

    console.log(`[calculate_user_stance] Calculated stance: ${stanceScore}, confidence: ${confidenceScore}`);

    return new Response(JSON.stringify({ 
      stanceScore,
      confidenceScore,
      semanticAnalysis
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('[calculate_user_stance] Function error:', error);
    
    // Return neutral fallback stance
    return new Response(JSON.stringify({ 
      stanceScore: 0,
      confidenceScore: 0.1,
      semanticAnalysis: {
        error: error.message,
        fallback: true,
        timestamp: new Date().toISOString()
      }
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});