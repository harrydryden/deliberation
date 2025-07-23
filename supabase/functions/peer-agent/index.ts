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
    const { message_id, content, user_id } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's recent messages for context (no deliberation needed for single-user chat)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get default agent configuration
    const { data: agentConfig } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', 'peer_agent')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    const context = recentMessages?.reverse().map(m => 
      `[${m.message_type}]: ${m.content}`
    ).join('\n') || '';

    // Build dynamic prompt from configuration
    const systemPrompt = agentConfig?.system_prompt || `You are the Peer Agent, representing diverse perspectives and alternative viewpoints in democratic deliberation.

YOUR ROLE:
- Present thoughtful counterpoints and alternative perspectives
- Ask challenging but constructive questions
- Help explore the full spectrum of an issue
- Encourage critical thinking and deeper analysis
- Represent voices that might not otherwise be heard`;

    const goals = agentConfig?.goals?.length ? 
      `GOALS:\n${agentConfig.goals.map(goal => `- ${goal}`).join('\n')}\n\n` : '';

    const responseStyle = agentConfig?.response_style ? 
      `RESPONSE STYLE:\n${agentConfig.response_style}\n\n` : 
      `RESPONSE STYLE:\n- Thoughtful and challenging\n- Present alternative viewpoints respectfully\n- Ask probing questions\n- Keep responses concise (2-3 paragraphs max)\n\n`;

    const peerAgentPrompt = `${systemPrompt}

${goals}CONVERSATION CONTEXT:
${context}

NEW USER MESSAGE: "${content}"

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
        user_id: user_id,
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