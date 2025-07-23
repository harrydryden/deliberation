import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, deliberationId, userId } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get deliberation context
    const { data: deliberation } = await supabase
      .from('deliberations')
      .select('title, description')
      .eq('id', deliberationId)
      .single();

    // Get overall message count and participation patterns
    const { data: messageStats } = await supabase
      .from('messages')
      .select('message_type, user_id, created_at')
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: true });

    // Get recent flow from all sources
    const { data: recentFlow } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: false })
      .limit(8);

    const userMessageCount = messageStats?.filter(m => m.message_type === 'user').length || 0;
    const agentResponseCount = messageStats?.filter(m => m.message_type !== 'user').length || 0;
    const uniqueParticipants = new Set(messageStats?.filter(m => m.message_type === 'user').map(m => m.user_id)).size;

    const flowContext = recentFlow?.reverse().map(m => 
      `[${m.message_type}]: ${m.content}`
    ).join('\n') || '';

    const flowAgentPrompt = `You are the Flow Agent, managing the overall process and rhythm of democratic deliberation using IBIS framework.

DELIBERATION TOPIC: ${deliberation?.title}
DESCRIPTION: ${deliberation?.description}

YOUR ROLE:
- Guide the overall deliberation process
- Identify when to deepen discussion vs. move to new topics
- Recognize patterns of agreement, disagreement, or stagnation
- Facilitate productive flow and maintain engagement
- Suggest process improvements and next steps

CURRENT PARTICIPANT'S MESSAGE: "${message}"

DELIBERATION STATISTICS:
- Total user messages: ${userMessageCount}
- Agent responses: ${agentResponseCount}
- Unique participants: ${uniqueParticipants}

RECENT DISCUSSION FLOW:
${flowContext}

INSTRUCTIONS:
1. Assess the current state of the deliberation process
2. Determine if the discussion needs:
   - Deeper exploration of current topics
   - Transition to new aspects
   - Clarification or refocusing
   - Summary and synthesis
3. Provide guidance that:
   - Acknowledges the current contribution
   - Suggests productive next steps
   - Maintains momentum and engagement
   - Identifies opportunities for consensus or deeper exploration

RESPONSE STYLE:
- Authoritative yet supportive
- Process-focused and strategic
- Clear about next steps
- Encouraging of continued participation (2-3 paragraphs max)

Respond as the Flow Agent:`;

    console.log('Calling Anthropic API for Flow Agent...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: flowAgentPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const agentResponse = data.content[0].text;

    // Store the agent's response in the database
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        deliberation_id: deliberationId,
        user_id: null,
        message_type: 'flow_agent'
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: agentResponse 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Flow Agent error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});