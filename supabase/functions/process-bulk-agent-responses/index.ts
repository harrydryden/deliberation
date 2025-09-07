import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ProcessingResult {
  messageId: string;
  status: 'success' | 'failed' | 'duplicate_detected' | 'skipped';
  attempts: number;
  error?: string;
  responseId?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

class MessageProcessor {
  private supabase: any;
  private authHeader: string;

  constructor(supabase: any, authHeader: string) {
    this.supabase = supabase;
    this.authHeader = authHeader;
  }

  // Check if a message already has an agent response
  async hasExistingResponse(messageId: string, deliberationId: string): Promise<{exists: boolean, responseId?: string}> {
    const { data: existingResponse, error } = await this.supabase
      .from('messages')
      .select('id')
      .eq('deliberation_id', deliberationId)
      .eq('parent_message_id', messageId)
      .neq('message_type', 'user')
      .limit(1);
    
    if (error) {
      console.error(`❌ Error checking existing response for message ${messageId}:`, error);
      return { exists: false };
    }

    return {
      exists: existingResponse && existingResponse.length > 0,
      responseId: existingResponse?.[0]?.id
    };
  }

  // Process a single message with orchestration
  async processMessage(message: any): Promise<ProcessingResult> {
    const { id: messageId, deliberation_id: deliberationId } = message;
    console.log(`🔄 Starting processing for message ${messageId}`);

    // CRITICAL: Always check for existing response first
    const existingCheck = await this.hasExistingResponse(messageId, deliberationId);
    if (existingCheck.exists) {
      console.log(`✅ Message ${messageId} already has response ${existingCheck.responseId} - skipping`);
      return {
        messageId,
        status: 'duplicate_detected',
        attempts: 0,
        responseId: existingCheck.responseId
      };
    }

    const MAX_ATTEMPTS = 8;
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log(`🚀 Orchestration attempt ${attempt}/${MAX_ATTEMPTS} for message ${messageId}`);

      try {
        // Double-check for existing response before each attempt
        const preAttemptCheck = await this.hasExistingResponse(messageId, deliberationId);
        if (preAttemptCheck.exists) {
          console.log(`⚠️ Response created during processing for message ${messageId} - stopping attempts`);
          return {
            messageId,
            status: 'duplicate_detected',
            attempts: attempt - 1,
            responseId: preAttemptCheck.responseId
          };
        }

        // Call orchestration with specific attempt tracking
        const orchestrationResult = await this.supabase.functions.invoke(
          'agent-orchestration-stream',
          {
            headers: { authorization: this.authHeader },
            body: {
              messageId: messageId,
              deliberationId: deliberationId,
              mode: 'bulk_processing',
              attempt: attempt,
              preventDuplicates: true
            }
          }
        );

        if (orchestrationResult.error) {
          console.error(`❌ Orchestration attempt ${attempt} failed for message ${messageId}:`, orchestrationResult.error);
          
          if (attempt < MAX_ATTEMPTS) {
            const backoffDelay = Math.min(2000 * Math.pow(1.5, attempt), 10000);
            console.log(`⏳ Waiting ${backoffDelay}ms before retry attempt ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          } else {
            throw new Error(`All orchestration attempts failed: ${orchestrationResult.error.message}`);
          }
        }

        console.log(`✅ Orchestration completed for message ${messageId}`);

        // Robust verification with multiple checks and longer waits
        let verificationSuccess = false;
        let responseId = null;
        
        for (let checkAttempt = 1; checkAttempt <= 10; checkAttempt++) {
          const waitTime = checkAttempt <= 3 ? 2000 : checkAttempt <= 6 ? 5000 : 8000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          console.log(`🔍 Verification check ${checkAttempt}/10 for message ${messageId}`);
          
          const verificationResult = await this.hasExistingResponse(messageId, deliberationId);
          
          if (verificationResult.exists) {
            console.log(`🎉 Agent response verified for message ${messageId} on check ${checkAttempt}`);
            verificationSuccess = true;
            responseId = verificationResult.responseId;
            break;
          }
        }

        if (verificationSuccess) {
          return {
            messageId,
            status: 'success',
            attempts: attempt,
            responseId: responseId!
          };
        } else {
          console.error(`❌ No response found after orchestration for message ${messageId}, attempt ${attempt}`);
          
          if (attempt < MAX_ATTEMPTS) {
            console.log(`🔄 Will retry orchestration for message ${messageId}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          } else {
            throw new Error('Orchestration completed but no response was created after all verification attempts');
          }
        }

      } catch (error) {
        console.error(`❌ Exception during orchestration attempt ${attempt} for message ${messageId}:`, error);
        
        if (attempt < MAX_ATTEMPTS) {
          const backoffDelay = Math.min(3000 * Math.pow(1.5, attempt), 15000);
          console.log(`⏳ Exception recovery: waiting ${backoffDelay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        } else {
          return {
            messageId,
            status: 'failed',
            attempts: attempt,
            error: error.message
          };
        }
      }
    }

    return {
      messageId,
      status: 'failed',
      attempts: MAX_ATTEMPTS,
      error: 'Maximum attempts exceeded'
    };
  }
}

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

    console.log(`🚀 Starting HIGH-RELIABILITY agent response processing for batch: ${batchId}`);

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
      console.error('❌ Error fetching messages:', messagesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!messages || messages.length === 0) {
      console.log('✅ No messages found awaiting agent responses');
      return new Response(JSON.stringify({ 
        message: 'No messages found awaiting agent responses',
        batch_id: batchId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📊 Processing ${messages.length} messages with HIGH-RELIABILITY processing`);

    // Initialize processor
    const processor = new MessageProcessor(supabase, authHeader);
    
    // Process messages in smaller batches for better reliability
    const BATCH_SIZE = 25; // Smaller batches for better monitoring
    const results: ProcessingResult[] = [];
    
    for (let batchStart = 0; batchStart < messages.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, messages.length);
      const currentBatch = messages.slice(batchStart, batchEnd);
      
      console.log(`🔄 Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(messages.length/BATCH_SIZE)} (messages ${batchStart + 1}-${batchEnd})`);

      // Process each message in the current batch sequentially for maximum reliability
      for (const message of currentBatch) {
        const result = await processor.processMessage(message);
        results.push(result);

        // Update message status based on result
        let bulkImportStatus = 'processing_error';
        if (result.status === 'success' || result.status === 'duplicate_detected') {
          bulkImportStatus = 'agent_response_generated';
        }

        await supabase
          .from('messages')
          .update({ bulk_import_status: bulkImportStatus })
          .eq('id', result.messageId);

        console.log(`📝 Message ${result.messageId}: ${result.status} (${result.attempts} attempts)`);
        
        // Small delay between messages to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Update progress after each batch
      const successCount = results.filter(r => r.status === 'success' || r.status === 'duplicate_detected').length;
      const failedCount = results.filter(r => r.status === 'failed').length;
      
      console.log(`📊 Batch progress: ${successCount} successful, ${failedCount} failed`);
      
      await supabase
        .from('bulk_import_batches')
        .update({
          processed_messages: successCount,
          failed_messages: failedCount
        })
        .eq('id', batchId);
    }

    // Final statistics
    const successCount = results.filter(r => r.status === 'success').length;
    const duplicateCount = results.filter(r => r.status === 'duplicate_detected').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const totalProcessed = successCount + duplicateCount;
    const successRate = ((totalProcessed / messages.length) * 100).toFixed(1);

    // Update final batch status
    const finalStatus = failedCount === 0 ? 'completed' : 'completed';
    
    await supabase
      .from('bulk_import_batches')
      .update({
        processing_status: finalStatus,
        import_status: 'completed',
        processed_messages: totalProcessed,
        failed_messages: failedCount
      })
      .eq('id', batchId);

    console.log(`🎉 HIGH-RELIABILITY Processing completed:`);
    console.log(`✅ New responses: ${successCount}`);
    console.log(`🔄 Existing responses: ${duplicateCount}`); 
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📈 Success rate: ${successRate}%`);

    // Log detailed results for debugging
    const failedResults = results.filter(r => r.status === 'failed');
    if (failedResults.length > 0) {
      console.log('❌ Failed messages details:');
      failedResults.forEach(r => {
        console.log(`  - Message ${r.messageId}: ${r.error} (${r.attempts} attempts)`);
      });
    }

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      total_messages: messages.length,
      new_responses: successCount,
      existing_responses: duplicateCount,
      failed_messages: failedCount,
      success_rate: `${successRate}%`,
      message: `Processed ${totalProcessed}/${messages.length} messages (${successRate}% success rate)`,
      details: {
        results: results
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Critical error in process-bulk-agent-responses function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});