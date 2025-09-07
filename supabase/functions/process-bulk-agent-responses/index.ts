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

    // Simple, reliable processing - one message at a time with agent orchestration
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

        // Use agent orchestration with simpler timeout handling
        console.log(`🚀 Invoking agent orchestration for message ${message.id}`);
        
        const orchestrationPromise = supabase.functions.invoke(
          'agent-orchestration-stream',
          {
            headers: { authorization: authHeader },
            body: {
              messageId: message.id,
              deliberationId: message.deliberation_id,
              mode: 'bulk_processing'
            }
          }
        );

        // Simple 30-second timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Orchestration timeout after 30s')), 30000)
        );

        const { error: orchestrationError } = await Promise.race([
          orchestrationPromise,
          timeoutPromise
        ]);

        if (orchestrationError) {
          console.error(`❌ Agent orchestration failed for message ${message.id}:`, orchestrationError);
          throw orchestrationError;
        }

        console.log(`✅ Agent orchestration completed for message ${message.id}`);

        // Simple verification - just check once after a reasonable delay
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        const { data: responseCheck } = await supabase
          .from('messages')
          .select('id')
          .eq('deliberation_id', message.deliberation_id)
          .eq('parent_message_id', message.id)
          .neq('message_type', 'user')
          .limit(1);
        
        if (responseCheck && responseCheck.length > 0) {
          console.log(`🎉 Agent response verified for message ${message.id}`);
          processedCount++;
          
          await supabase
            .from('messages')
            .update({ bulk_import_status: 'agent_response_generated' })
            .eq('id', message.id);
        } else {
          // One retry attempt
          console.log(`⚠️ No response found, retrying for message ${message.id}...`);
          
          const { error: retryError } = await supabase.functions.invoke(
            'agent-orchestration-stream',
            {
              headers: { authorization: authHeader },
              body: {
                messageId: message.id,
                deliberationId: message.deliberation_id,
                mode: 'bulk_processing_retry'
              }
            }
          );

          if (!retryError) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for retry
            
            const { data: retryCheck } = await supabase
              .from('messages')
              .select('id')
              .eq('deliberation_id', message.deliberation_id)
              .eq('parent_message_id', message.id)
              .neq('message_type', 'user')
              .limit(1);
            
            if (retryCheck && retryCheck.length > 0) {
              console.log(`✅ Retry successful for message ${message.id}`);
              processedCount++;
              
              await supabase
                .from('messages')
                .update({ bulk_import_status: 'agent_response_generated' })
                .eq('id', message.id);
            } else {
              throw new Error('No response after retry');
            }
          } else {
            throw new Error(`Retry failed: ${retryError.message}`);
          }
        }

        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Failed to process message ${message.id}:`, error);
        failedCount++;
        
        await supabase
          .from('messages')
          .update({ bulk_import_status: 'processing_error' })
          .eq('id', message.id);
      }

      // Update progress every 5 messages
      if (i % 5 === 0 || i === messages.length - 1) {
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