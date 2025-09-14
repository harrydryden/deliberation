import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get circuit breaker states
    const { data: circuitBreakers } = await supabase
      .from('circuit_breaker_state')
      .select('*');

    // Get active agent configurations
    const { data: agentConfigs } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('is_active', true);

    // Test OpenAI API key
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    let openaiStatus = 'Missing';
    if (openaiKey) {
      try {
        const testResponse = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${openaiKey}` }
        });
        openaiStatus = testResponse.ok ? 'Valid' : 'Invalid';
      } catch (error) {
        openaiStatus = 'Error';
      }
    }

    // Get recent agent interactions
    const { data: recentInteractions } = await supabase
      .from('agent_interactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    // Get recent messages
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, message_type, created_at, agent_context')
      .order('created_at', { ascending: false })
      .limit(10);

    const diagnosis = {
      timestamp: new Date().toISOString(),
      circuitBreakers,
      agentConfigs: agentConfigs?.map(config => ({
        id: config.id,
        name: config.name,
        agent_type: config.agent_type,
        is_active: config.is_active,
        hasPromptOverride: !!config.prompt_overrides?.system_prompt,
        preferredModel: config.preferred_model
      })),
      openaiStatus,
      recentInteractions: recentInteractions?.length || 0,
      recentMessages: recentMessages?.map(msg => ({
        id: msg.id,
        type: msg.message_type,
        created_at: msg.created_at,
        hasAgentContext: !!msg.agent_context
      })),
      environment: {
        hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
        hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        hasOpenaiKey: !!openaiKey
      }
    };

    return new Response(JSON.stringify(diagnosis, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});