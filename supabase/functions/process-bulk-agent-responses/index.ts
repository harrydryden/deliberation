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
    const processingResults = [];

    // Process messages in smaller chunks to prevent timeouts
    const chunkSize = 20; // Process 20 messages at a time
    
    for (let chunkIndex = 0; chunkIndex < messages.length; chunkIndex += chunkSize) {
      const chunk = messages.slice(chunkIndex, Math.min(chunkIndex + chunkSize, messages.length));
      console.log(`Processing chunk ${Math.floor(chunkIndex / chunkSize) + 1}/${Math.ceil(messages.length / chunkSize)} (${chunk.length} messages)`);
      
      // Process each message in the chunk
      for (let messageIndex = 0; messageIndex < chunk.length; messageIndex++) {
        const globalMessageIndex = chunkIndex + messageIndex;
        const message = chunk[messageIndex];
        console.log(`Processing message ${globalMessageIndex + 1}/${messages.length}: ${message.id}`);

      try {
        // First check if a response already exists
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
          
          // Mark message as processed
          await supabase
            .from('messages')
            .update({
              bulk_import_status: 'agent_response_generated'
            })
            .eq('id', message.id);
          
          continue;
        }

        // Call the agent orchestration function once
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
          console.error(`❌ Agent orchestration failed for message ${message.id}:`, agentError);
          failedCount++;
          await supabase
            .from('messages')
            .update({
              bulk_import_status: 'failed'
            })
            .eq('id', message.id);
          continue;
        }

        // Use exponential backoff for robust verification
        let responseVerified = false;
        const maxVerificationAttempts = 6;
        
        for (let attempt = 1; attempt <= maxVerificationAttempts; attempt++) {
          // Exponential backoff: 500ms, 1s, 2s, 4s, 8s, 16s (max 31.5s total)
          const delay = Math.min(500 * Math.pow(2, attempt - 1), 16000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const { data: responseCheck } = await supabase
            .from('messages')
            .select('id')
            .eq('deliberation_id', message.deliberation_id)
            .eq('parent_message_id', message.id)
            .neq('message_type', 'user')
            .limit(1);
          
          if (responseCheck && responseCheck.length > 0) {
            console.log(`✅ Agent response verified for message ${message.id} (attempt ${attempt})`);
            processedCount++;
            responseVerified = true;
            
            // Mark message as processed
            await supabase
              .from('messages')
              .update({
                bulk_import_status: 'agent_response_generated'
              })
              .eq('id', message.id);
            
            processingResults.push({ messageId: message.id, status: 'success', attempts: attempt });
            break;
          } else if (attempt < maxVerificationAttempts) {
            console.log(`🔍 Attempt ${attempt}/${maxVerificationAttempts}: Waiting for response for message ${message.id}...`);
          }
        }
        
        if (!responseVerified) {
          console.error(`❌ No response found after ${maxVerificationAttempts} attempts for message ${message.id}`);
          failedCount++;
          await supabase
            .from('messages')
            .update({
              bulk_import_status: 'verification_failed'
            })
            .eq('id', message.id);
          
          processingResults.push({ messageId: message.id, status: 'verification_failed', attempts: maxVerificationAttempts });
        }

        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
          failedCount++;
          await supabase
            .from('messages')
            .update({
              bulk_import_status: 'processing_error'
            })
            .eq('id', message.id);
          
          processingResults.push({ messageId: message.id, status: 'processing_error', error: error.message });
        }

        // Minimal delay between messages within chunk
        if (messageIndex < chunk.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Longer pause between chunks to prevent overwhelming the system
      if (chunkIndex + chunkSize < messages.length) {
        console.log(`Chunk ${Math.floor(chunkIndex / chunkSize) + 1} completed. Pausing before next chunk...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second pause between chunks
      }
    }

    // Update final batch progress
    await supabase
      .from('bulk_import_batches')
      .update({
        processed_messages: processedCount,
        failed_messages: failedCount,
        processing_log: [
          ...(batch.processing_log || []),
          {
            timestamp: new Date().toISOString(),
            action: 'processing_completed',
            details: { 
              processed: processedCount, 
              failed: failedCount,
              success_rate: processedCount + failedCount > 0 ? (processedCount / (processedCount + failedCount) * 100).toFixed(1) + '%' : '0%',
              results_summary: processingResults.reduce((acc, result) => {
                acc[result.status] = (acc[result.status] || 0) + 1;
                return acc;
              }, {})
            }
          }
        ]
      })
      .eq('id', batchId);

    console.log(`📊 Final Progress: ${processedCount + failedCount}/${messages.length} messages processed (${processedCount} successful, ${failedCount} failed)`);
    
    // Enhanced recovery for any remaining failures
    const criticalFailures = processingResults.filter(r => r.status === 'processing_error' || r.status === 'verification_failed');

    // Enhanced recovery system for high reliability
    if (criticalFailures.length > 0) {
      console.log(`🔍 Running enhanced recovery for ${criticalFailures.length} critical failures...`);
      
      const { data: failedMessages } = await supabase
        .from('messages')
        .select('id, content, user_id, deliberation_id, created_at')
        .eq('deliberation_id', batch.deliberation_id)
        .in('bulk_import_status', ['verification_failed', 'processing_error'])
        .order('created_at', { ascending: true });

      if (failedMessages && failedMessages.length > 0) {
        let recoveredCount = 0;
        
        for (const failedMsg of failedMessages) {
          console.log(`🔄 Attempting recovery for message ${failedMsg.id}...`);
          
          // First check if response exists
          const { data: existingResponse } = await supabase
            .from('messages')
            .select('id')
            .eq('deliberation_id', batch.deliberation_id)
            .eq('parent_message_id', failedMsg.id)
            .neq('message_type', 'user')
            .limit(1);
            
          if (existingResponse && existingResponse.length > 0) {
            console.log(`✅ Found existing response for message ${failedMsg.id}`);
            await supabase
              .from('messages')
              .update({ bulk_import_status: 'agent_response_generated' })
              .eq('id', failedMsg.id);
            recoveredCount++;
            processedCount++;
            failedCount--;
          } else {
            // Retry agent orchestration with enhanced error handling
            try {
              console.log(`🔄 Retrying agent orchestration for message ${failedMsg.id}...`);
              const { data: retryResponse, error: retryError } = await supabase.functions.invoke(
                'agent-orchestration-stream',
                {
                  headers: { authorization: authHeader },
                  body: {
                    messageId: failedMsg.id,
                    deliberationId: failedMsg.deliberation_id,
                    mode: 'recovery_retry'
                  }
                }
              );

              if (!retryError) {
                // Use more aggressive verification for retries
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
                
                const { data: retryCheck } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('deliberation_id', batch.deliberation_id)
                  .eq('parent_message_id', failedMsg.id)
                  .neq('message_type', 'user')
                  .limit(1);
                
                if (retryCheck && retryCheck.length > 0) {
                  console.log(`✅ Retry successful for message ${failedMsg.id}`);
                  await supabase
                    .from('messages')
                    .update({ bulk_import_status: 'agent_response_generated' })
                    .eq('id', failedMsg.id);
                  recoveredCount++;
                  processedCount++;
                  failedCount--;
                }
              }
            } catch (retryError) {
              console.error(`❌ Retry failed for message ${failedMsg.id}:`, retryError);
            }
          }
          
          // Small delay between recovery attempts
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`🎉 Recovery completed: ${recoveredCount} messages recovered`);
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

    const successRate = ((processedCount / messages.length) * 100).toFixed(1);
    const meetsTarget = parseFloat(successRate) >= 99.0;
    
    console.log(`🎯 Final Results: ${successRate}% success rate (target: 99%+) - ${meetsTarget ? 'TARGET MET' : 'BELOW TARGET'}`);

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      total_messages: messages.length,
      processed_messages: processedCount,
      failed_messages: failedCount,
      success_rate: `${successRate}%`,
      target_met: meetsTarget,
      processing_summary: processingResults.reduce((acc, result) => {
        acc[result.status] = (acc[result.status] || 0) + 1;
        return acc;
      }, {}),
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