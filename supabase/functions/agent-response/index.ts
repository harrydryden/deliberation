import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AgentConfig {
  id: string;
  name: string;
  agent_type: string;
  system_prompt: string;
  response_style?: string;
  goals?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageId, deliberationId } = await req.json();
    console.log('Processing agent response for message:', messageId, 'in deliberation:', deliberationId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError) {
      throw new Error(`Failed to get message: ${messageError.message}`);
    }

    // Get recent conversation context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get active agent configurations
    const { data: agents } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('is_active', true);

    if (!agents || agents.length === 0) {
      console.log('No active agents found');
      return new Response(JSON.stringify({ success: true, message: 'No active agents' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${agents.length} active agents`);

    // Generate responses from each active agent
    for (const agent of agents) {
      await generateAgentResponse(supabase, openaiApiKey, agent, message, recentMessages || [], deliberationId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in agent-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateAgentResponse(
  supabase: any,
  openaiApiKey: string,
  agent: AgentConfig,
  userMessage: any,
  recentMessages: any[],
  deliberationId: string
) {
  try {
    console.log(`Generating response for agent: ${agent.name} (${agent.agent_type})`);

    // Build conversation context
    const conversationContext = recentMessages
      .reverse()
      .map(msg => `${msg.message_type === 'user' ? 'User' : 'Agent'}: ${msg.content}`)
      .join('\n');

    // Create agent-specific system prompt
    let systemPrompt = agent.system_prompt || `You are ${agent.name}, a ${agent.agent_type} agent in a democratic deliberation platform.`;
    
    if (agent.goals && agent.goals.length > 0) {
      systemPrompt += `\n\nYour goals are:\n${agent.goals.map(goal => `- ${goal}`).join('\n')}`;
    }

    if (agent.response_style) {
      systemPrompt += `\n\nResponse style: ${agent.response_style}`;
    }

    systemPrompt += `\n\nYou are facilitating a deliberation. Provide thoughtful, balanced responses that encourage productive dialogue. Keep responses concise but meaningful.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Recent conversation:\n${conversationContext}\n\nLatest message: ${userMessage.content}\n\nPlease provide your response as ${agent.name}.` }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const aiData = await response.json();
    
    if (!aiData.choices?.[0]?.message?.content) {
      console.error('No response from OpenAI for agent:', agent.name);
      return;
    }

    const agentResponse = aiData.choices[0].message.content;

    // Store agent response in database
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        message_type: agent.agent_type,
        deliberation_id: deliberationId,
        user_id: userMessage.user_id, // Associate with the user who triggered the response
        agent_context: {
          agent_id: agent.id,
          agent_name: agent.name,
          triggered_by_message: userMessage.id
        }
      });

    if (insertError) {
      console.error('Failed to insert agent response:', insertError);
    } else {
      console.log(`Successfully generated response from ${agent.name}`);
    }

  } catch (error) {
    console.error(`Error generating response for agent ${agent.name}:`, error);
  }
}