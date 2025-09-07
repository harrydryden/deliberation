import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for required OpenAI API key
    if (!Deno.env.get('OPENAI_API_KEY')) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header to verify admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.user_role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { batchId } = await req.json();

    if (!batchId) {
      return new Response(JSON.stringify({ error: 'Missing batchId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting agent response processing for batch: ${batchId}`);

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return new Response(JSON.stringify({ error: 'Batch not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update batch status to processing
    await supabase
      .from('bulk_import_batches')
      .update({
        processing_status: 'in_progress'
      })
      .eq('id', batchId);

    // Get messages that need agent responses
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, content, user_id, deliberation_id, created_at')
      .eq('deliberation_id', batch.deliberation_id)
      .eq('bulk_import_status', 'awaiting_agent_response')
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No messages found awaiting agent responses',
        batch_id: batchId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${messages.length} messages for agent responses`);

    let processedCount = 0;
    let failedCount = 0;

    // Simple, reliable processing - one message at a time
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      console.log(`🔄 Processing message ${i + 1}/${messages.length}: ${message.id}`);

      try {
        // Check if response already exists
        const { data: existingResponse } = await supabase
          .from('messages')
          .select('id')
          .eq('deliberation_id', message.deliberation_id)
          .eq('parent_message_id', message.id)
          .neq('message_type', 'user')
          .limit(1);
        
        if (existingResponse && existingResponse.length > 0) {
          console.log(`✅ Agent response already exists for message ${message.id}`);
          processedCount++;
          
          await supabase
            .from('messages')
            .update({ bulk_import_status: 'agent_response_generated' })
            .eq('id', message.id);
          continue;
        }

        // Get recent messages for context
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('id, content, message_type, created_at, agent_config_id')
          .eq('deliberation_id', message.deliberation_id)
          .order('created_at', { ascending: false })
          .limit(20);

        // Get agent configs for this deliberation
        const { data: agentConfigs } = await supabase
          .from('agent_configurations')
          .select('id, name, agent_type, system_prompt, response_style, goals')
          .eq('deliberation_id', message.deliberation_id)
          .eq('is_active', true);

        if (!agentConfigs || agentConfigs.length === 0) {
          console.log(`⚠️ No active agent configs found for deliberation ${message.deliberation_id}`);
          failedCount++;
          continue;
        }

        // Simple agent selection - just use the first active agent of type bill_agent, or any agent
        const billAgent = agentConfigs.find(a => a.agent_type === 'bill_agent');
        const selectedAgent = billAgent || agentConfigs[0];

        console.log(`🤖 Selected agent: ${selectedAgent.name} (${selectedAgent.agent_type})`);

        // Create agent response directly via OpenAI
        const systemPrompt = selectedAgent.system_prompt || `You are ${selectedAgent.name}. ${selectedAgent.response_style || ''}`;
        
        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message.content }
            ],
            max_tokens: 2000,
            temperature: 0.7
          })
        });

        if (!openAIResponse.ok) {
          throw new Error(`OpenAI API error: ${openAIResponse.status}`);
        }

        const openAIData = await openAIResponse.json();
        const agentResponseContent = openAIData.choices[0]?.message?.content;

        if (!agentResponseContent) {
          throw new Error('No response content from OpenAI');
        }

        // Insert agent response message
        const { error: insertError } = await supabase
          .from('messages')
          .insert({
            deliberation_id: message.deliberation_id,
            user_id: selectedAgent.id, // Use agent config ID as user_id for agent messages
            content: agentResponseContent,
            message_type: selectedAgent.agent_type,
            parent_message_id: message.id,
            agent_config_id: selectedAgent.id,
            bulk_import_status: 'completed'
          });

        if (insertError) {
          throw new Error(`Failed to insert agent response: ${insertError.message}`);
        }

        // Mark original message as processed
        await supabase
          .from('messages')
          .update({ bulk_import_status: 'agent_response_generated' })
          .eq('id', message.id);

        console.log(`✅ Successfully created agent response for message ${message.id}`);
        processedCount++;

        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Failed to process message ${message.id}:`, error);
        failedCount++;
        
        await supabase
          .from('messages')
          .update({ bulk_import_status: 'processing_error' })
          .eq('id', message.id);
      }

      // Update progress every 10 messages
      if (i % 10 === 0 || i === messages.length - 1) {
        const successRate = ((processedCount / (processedCount + failedCount)) * 100).toFixed(1);
        console.log(`📊 Progress: ${processedCount + failedCount}/${messages.length} (${successRate}% success rate)`);
        
        await supabase
          .from('bulk_import_batches')
          .update({
            processed_messages: processedCount,
            failed_messages: failedCount
          })
          .eq('id', batchId);
      }
    }

    // Update final batch status
    const finalStatus = failedCount === 0 ? 'completed' : 'completed';
    
    await supabase
      .from('bulk_import_batches')
      .update({
        processing_status: finalStatus,
        import_status: 'completed',
        processed_messages: processedCount,
        failed_messages: failedCount
      })
      .eq('id', batchId);

    console.log(`✅ Processing completed. Success: ${processedCount}, Failed: ${failedCount}`);
    const successRate = ((processedCount / messages.length) * 100).toFixed(1);

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      total_messages: messages.length,
      processed_messages: processedCount,
      failed_messages: failedCount,
      success_rate: `${successRate}%`,
      message: `Processed ${processedCount}/${messages.length} messages (${successRate}% success rate)`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-bulk-agent-responses function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});