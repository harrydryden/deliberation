import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 Agent response function called!');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('📊 Request body:', body);
    
    const { messageId, deliberationId } = body;
    console.log('🔍 Processing agent response for message:', messageId, 'in deliberation:', deliberationId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasOpenAIKey: !!openaiApiKey
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user message
    console.log('📨 Fetching message...');
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError) {
      console.error('❌ Message error:', messageError);
      throw new Error(`Failed to get message: ${messageError.message}`);
    }

    console.log('✅ Message found:', message.content);

    // Get deliberation context if deliberationId is provided
    let deliberationContext = '';
    if (deliberationId) {
      console.log('📋 Fetching deliberation context...');
      const { data: deliberation, error: deliberationError } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single();

      if (deliberation && !deliberationError) {
        const context = [];
        context.push(`DELIBERATION TITLE: ${deliberation.title}`);
        
        if (deliberation.notion) {
          context.push(`DELIBERATION NOTION: ${deliberation.notion}`);
        }
        
        if (deliberation.description) {
          context.push(`DELIBERATION DESCRIPTION: ${deliberation.description}`);
        }

        deliberationContext = context.length > 1 ? `\n\nDELIBERATION CONTEXT:\n${context.join('\n')}\n\n` : '';
        console.log('✅ Deliberation context loaded');
      }
    }

    // Get active agents
    console.log('🤖 Fetching active agents...');
    const { data: agents, error: agentsError } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('is_active', true);

    if (agentsError) {
      console.error('❌ Agents error:', agentsError);
      throw new Error(`Failed to get agents: ${agentsError.message}`);
    }

    console.log(`🎯 Found ${agents?.length || 0} active agents`);

    if (!agents || agents.length === 0) {
      console.log('⚠️ No active agents found');
      return new Response(JSON.stringify({ success: true, message: 'No active agents' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate a simple response from the first agent for testing
    const agent = agents[0];
    console.log(`🧠 Generating response from ${agent.name}...`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `${agent.system_prompt || `You are ${agent.name}, a deliberation agent.`}${deliberationContext}`
          },
          { 
            role: 'user', 
            content: `Please respond to this message in the deliberation: "${message.content}"`
          }
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    console.log('🔄 OpenAI response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiData = await response.json();
    console.log('✅ OpenAI response received');
    
    if (!aiData.choices?.[0]?.message?.content) {
      console.error('❌ No content in OpenAI response');
      throw new Error('No response content from OpenAI');
    }

    const agentResponse = aiData.choices[0].message.content;
    console.log('💬 Agent response:', agentResponse.substring(0, 100) + '...');

    // Store agent response in database
    console.log('💾 Storing agent response...');
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        message_type: agent.agent_type,
        deliberation_id: deliberationId,
        user_id: message.user_id,
        agent_context: {
          agent_id: agent.id,
          agent_name: agent.name,
          triggered_by_message: messageId
        }
      });

    if (insertError) {
      console.error('❌ Insert error:', insertError);
      throw new Error(`Failed to insert response: ${insertError.message}`);
    }

    console.log('🎉 Agent response stored successfully!');

    return new Response(JSON.stringify({ 
      success: true, 
      agentName: agent.name,
      responseLength: agentResponse.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in agent-response function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});