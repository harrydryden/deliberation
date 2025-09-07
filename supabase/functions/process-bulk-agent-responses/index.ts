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
    let retryQueue = [];
    const maxRetries = 2;

    // Enhanced processing with retry logic and better verification
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
      const message = messages[messageIndex];
      let attempts = 0;
      let success = false;

      while (attempts <= maxRetries && !success) {
        try {
          attempts++;
          const attemptLabel = attempts > 1 ? ` (attempt ${attempts})` : '';
          console.log(`Processing message ${messageIndex + 1}/${messages.length}: ${message.id}${attemptLabel}`);

          // Call the agent orchestration function
          const { data: agentResponse, error: agentError } = await supabase.functions.invoke(
            'agent-orchestration-stream',
            {
              headers: {
                authorization: authHeader
              },
              body: {
                messageId: message.id,
                deliberationId: message.deliberation_id,
                mode: 'bulk_processing'
              }
            }
          );

          if (agentError) {
            console.error(`❌ Agent orchestration failed for message ${message.id} (attempt ${attempts}):`, agentError);
            
            // If this was a timeout or network error, retry
            if (attempts <= maxRetries && (
              agentError.message?.includes('timeout') || 
              agentError.message?.includes('network') ||
              agentError.message?.includes('fetch')
            )) {
              console.log(`🔄 Retrying message ${message.id} due to transient error`);
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer for retries
              continue;
            }
          } else {
            // Enhanced response verification with retries
            let responseFound = false;
            const maxVerificationAttempts = 5;
            
            for (let verifyAttempt = 1; verifyAttempt <= maxVerificationAttempts; verifyAttempt++) {
              // Wait longer for database writes to complete
              await new Promise(resolve => setTimeout(resolve, verifyAttempt * 1000));
              
              const { data: responseCheck } = await supabase
                .from('messages')
                .select('id, content, created_at')
                .eq('deliberation_id', message.deliberation_id)
                .eq('parent_message_id', message.id)
                .neq('message_type', 'user')
                .order('created_at', { ascending: false })
                .limit(1);
              
              if (responseCheck && responseCheck.length > 0) {
                console.log(`✅ Agent response verified for message ${message.id} (verification attempt ${verifyAttempt})`);
                processedCount++;
                success = true;
                responseFound = true;
                
                // Mark message as processed
                await supabase
                  .from('messages')
                  .update({
                    bulk_import_status: 'agent_response_generated'
                  })
                  .eq('id', message.id);
                break;
              } else if (verifyAttempt < maxVerificationAttempts) {
                console.log(`🔍 Response not yet found for message ${message.id}, waiting... (attempt ${verifyAttempt})`);
              }
            }
            
            if (!responseFound) {
              console.error(`❌ No agent response found in database for message ${message.id} after ${maxVerificationAttempts} verification attempts`);
              
              // If this was our last retry attempt, mark as failed
              if (attempts >= maxRetries) {
                success = false; // Will be marked as failed below
              } else {
                console.log(`🔄 Retrying message ${message.id} due to missing response`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
              }
            } else {
              success = true;
            }
          }

          // If we reach here and success is false, mark as failed
          if (!success && attempts >= maxRetries) {
            failedCount++;
            await supabase
              .from('messages')
              .update({
                bulk_import_status: 'failed'
              })
              .eq('id', message.id);
          }

        } catch (error) {
          console.error(`Error processing message ${message.id} (attempt ${attempts}):`, error);
          
          // Retry on certain errors
          if (attempts <= maxRetries && (
            error.message?.includes('timeout') || 
            error.message?.includes('network') ||
            error.message?.includes('Connection')
          )) {
            console.log(`🔄 Retrying message ${message.id} due to error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          } else if (attempts >= maxRetries) {
            failedCount++;
            await supabase
              .from('messages')
              .update({
                bulk_import_status: 'failed'
              })
              .eq('id', message.id);
            success = true; // Exit the retry loop
          }
        }
      }

      // Dynamic rate limiting based on success rate
      const successRate = processedCount / (processedCount + failedCount || 1);
      const waitTime = successRate > 0.8 ? 1500 : (successRate > 0.5 ? 2500 : 4000);
      
      console.log(`⏱️ Rate limiting: ${waitTime}ms (success rate: ${(successRate * 100).toFixed(1)}%)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Update batch progress more frequently
      if ((messageIndex + 1) % 5 === 0 || messageIndex === messages.length - 1) {
        await supabase
          .from('bulk_import_batches')
          .update({
            processed_messages: processedCount,
            failed_messages: failedCount,
            processing_log: [
              ...(batch.processing_log || []),
              {
                timestamp: new Date().toISOString(),
                action: 'progress_update',
                details: { 
                  processed: processedCount, 
                  failed: failedCount, 
                  current_message: messageIndex + 1,
                  success_rate: successRate
                }
              }
            ]
          })
          .eq('id', batchId);

        console.log(`📊 Progress: ${processedCount + failedCount}/${messages.length} messages processed (${processedCount} successful, ${failedCount} failed)`);
      }
    }

    // Final verification pass for any remaining failures
    if (failedCount > 0) {
      console.log(`🔍 Running final verification for ${failedCount} failed messages...`);
      
      const { data: failedMessages } = await supabase
        .from('messages')
        .select('id, parent_message_id')
        .eq('deliberation_id', batch.deliberation_id)
        .eq('bulk_import_status', 'failed')
        .order('created_at', { ascending: true });

      if (failedMessages && failedMessages.length > 0) {
        let recoveredCount = 0;
        
        for (const failedMsg of failedMessages) {
          // Check if response actually exists but wasn't found initially
          const { data: lateResponse } = await supabase
            .from('messages')
            .select('id')
            .eq('deliberation_id', batch.deliberation_id)
            .eq('parent_message_id', failedMsg.id)
            .neq('message_type', 'user')
            .limit(1);
            
          if (lateResponse && lateResponse.length > 0) {
            console.log(`✅ Found late response for previously failed message ${failedMsg.id}`);
            await supabase
              .from('messages')
              .update({ bulk_import_status: 'agent_response_generated' })
              .eq('id', failedMsg.id);
            
            recoveredCount++;
            processedCount++;
            failedCount--;
          }
        }
        
        if (recoveredCount > 0) {
          console.log(`🎉 Recovered ${recoveredCount} messages in final verification pass`);
        }
      }
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