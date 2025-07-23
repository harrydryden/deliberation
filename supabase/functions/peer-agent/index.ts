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

    // Get agent configuration
    const { data: agentConfig } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', 'peer_agent')
      .or(`deliberation_id.eq.${deliberationId},and(is_default.eq.true,deliberation_id.is.null)`)
      .eq('is_active', true)
      .order('deliberation_id', { ascending: false })
      .limit(1)
      .single();

    // Get user messages from other participants (excluding current user)
    const { data: otherMessages } = await supabase
      .from('messages')
      .select('content, message_type, created_at, profiles(display_name)')
      .eq('deliberation_id', deliberationId)
      .eq('message_type', 'user')
      .neq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get recent agent responses for context
    const { data: agentResponses } = await supabase
      .from('messages')
      .select('content, message_type')
      .eq('deliberation_id', deliberationId)
      .in('message_type', ['bill_agent', 'flow_agent'])
      .order('created_at', { ascending: false })
      .limit(3);

    const otherParticipantContext = otherMessages?.map(m => 
      `[Participant]: ${m.content}`
    ).join('\n') || 'No other participant messages yet.';

    const agentContext = agentResponses?.map(m => 
      `[${m.message_type}]: ${m.content}`
    ).join('\n') || '';

    // Build dynamic prompt from configuration
    const systemPrompt = agentConfig?.system_prompt || `You are the Peer Agent, facilitating communication between participants in a democratic deliberation using IBIS framework.

YOUR ROLE:
- Mediate between participants by contextualizing their contributions
- Highlight connections, agreements, and tensions between different viewpoints
- Translate perspectives to promote mutual understanding
- Encourage productive dialogue while maintaining participant privacy`;

    const goals = agentConfig?.goals?.length ? 
      `GOALS:\n${agentConfig.goals.map(goal => `- ${goal}`).join('\n')}\n\n` : '';

    const responseStyle = agentConfig?.response_style ? 
      `RESPONSE STYLE:\n${agentConfig.response_style}\n\n` : 
      `RESPONSE STYLE:\n- Warm and encouraging\n- Focus on building bridges between perspectives\n- Maintain participant anonymity\n- Keep responses focused and actionable (2-3 paragraphs max)\n\n`;

    const peerAgentPrompt = `${systemPrompt}

DELIBERATION TOPIC: ${deliberation?.title}
DESCRIPTION: ${deliberation?.description}

${goals}CURRENT PARTICIPANT'S MESSAGE: "${message}"

OTHER PARTICIPANTS' RECENT CONTRIBUTIONS:
${otherParticipantContext}

RECENT AGENT INSIGHTS:
${agentContext}

${responseStyle}Respond as the Peer Agent:`;

    console.log('Calling Anthropic API for Peer Agent...');
    
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
            content: peerAgentPrompt
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
        message_type: 'peer_agent'
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
    console.error('Peer Agent error:', error);
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