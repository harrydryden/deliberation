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
    const { message_id, user_id, content } = await req.json();
    
    console.log('AI Orchestrator processing message:', { message_id, user_id, content });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get message count for this user to determine which agents to trigger
    const { data: messageCount } = await supabase
      .from('messages')
      .select('id')
      .eq('user_id', user_id)
      .eq('message_type', 'user');

    const totalUserMessages = messageCount?.length || 0;

    // Determine which agents to call based on message patterns
    const agentsToCall = [];
    
    // Bill Agent: Always analyzes for IBIS structure and content analysis
    agentsToCall.push('bill-agent');
    
    // Peer Agent: Provides perspective and alternative viewpoints (every 2nd message)
    if (totalUserMessages > 1 && totalUserMessages % 2 === 0) {
      agentsToCall.push('peer-agent');
    }
    
    // Flow Agent: Manages conversation flow and suggests next steps (every 3rd message)
    if (totalUserMessages > 2 && totalUserMessages % 3 === 0) {
      agentsToCall.push('flow-agent');
    }

    console.log(`Calling agents: ${agentsToCall.join(', ')}`);

    // Call the selected agents
    const agentPromises = agentsToCall.map(async (agentName) => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${agentName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            message_id,
            content,
            user_id
          })
        });

        if (!response.ok) {
          console.error(`Error calling ${agentName}:`, await response.text());
          return null;
        }

        const result = await response.json();
        console.log(`${agentName} response:`, result);
        return { agent: agentName, result };
      } catch (error) {
        console.error(`Error calling ${agentName}:`, error);
        return null;
      }
    });

    const results = await Promise.all(agentPromises);
    const successfulResults = results.filter(r => r !== null);

    return new Response(
      JSON.stringify({ 
        success: true,
        agentsCalled: agentsToCall,
        results: successfulResults
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('AI Orchestrator error:', error);
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