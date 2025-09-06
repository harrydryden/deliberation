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
    const batchSize = 5; // Process 5 messages at a time to manage rate limits

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch_messages = messages.slice(i, i + batchSize);
      
      // Process each message in the batch
      for (const message of batch_messages) {
        try {
          console.log(`Processing message ${i + 1}/${messages.length}: ${message.id}`);

          // Get conversation context (previous messages in the deliberation)
          const { data: contextMessages } = await supabase
            .from('messages')
            .select('content, message_type, created_at')
            .eq('deliberation_id', message.deliberation_id)
            .lt('created_at', message.created_at)
            .order('created_at', { ascending: false })
            .limit(10);

          // Call the agent orchestration function
          const { data: agentResponse, error: agentError } = await supabase.functions.invoke(
            'agent-orchestration-stream',
            {
              body: {
                content: message.content,
                deliberationId: message.deliberation_id,
                userId: message.user_id,
                mode: 'chat',
                messageId: message.id,
                conversationHistory: contextMessages || [],
                isBulkProcessing: true
              }
            }
          );

          if (agentError) {
            console.error(`Agent orchestration failed for message ${message.id}:`, agentError);
            failedCount++;
            
            // Mark message as failed
            await supabase
              .from('messages')
              .update({
                bulk_import_status: 'failed'
              })
              .eq('id', message.id);
          } else {
            console.log(`Agent response generated for message ${message.id}`);
            processedCount++;
            
            // Mark message as processed
            await supabase
              .from('messages')
              .update({
                bulk_import_status: 'agent_response_generated'
              })
              .eq('id', message.id);
          }

          // Rate limiting - wait 1 second between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
          failedCount++;
          
          await supabase
            .from('messages')
            .update({
              bulk_import_status: 'failed'
            })
            .eq('id', message.id);
        }
      }

      // Update batch progress after each batch
      await supabase
        .from('bulk_import_batches')
        .update({
          processed_messages: processedCount,
          failed_messages: failedCount
        })
        .eq('id', batchId);

      // Log progress
      console.log(`Progress: ${processedCount + failedCount}/${messages.length} messages processed`);
    }

    // Update final batch status
    const finalProcessingStatus = failedCount === 0 ? 'completed' : (processedCount > 0 ? 'completed' : 'failed');
    const finalImportStatus = (processedCount === messages.length) ? 'completed' : 'processing_agents';

    await supabase
      .from('bulk_import_batches')
      .update({
        processing_status: finalProcessingStatus,
        import_status: finalImportStatus,
        processed_messages: processedCount,
        failed_messages: failedCount,
        processing_log: [
          ...(batch.processing_log || []),
          {
            timestamp: new Date().toISOString(),
            action: 'agent_processing_completed',
            details: { processed: processedCount, failed: failedCount }
          }
        ]
      })
      .eq('id', batchId);

    console.log(`Agent response processing completed. Processed: ${processedCount}, Failed: ${failedCount}`);

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      total_messages: messages.length,
      processed_messages: processedCount,
      failed_messages: failedCount,
      message: `Successfully processed ${processedCount} of ${messages.length} messages`
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