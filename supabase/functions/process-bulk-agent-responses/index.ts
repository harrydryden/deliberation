import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest
} from '../shared/edge-function-utils.ts';

interface ProcessingResult {
  messageId: string;
  status: 'success' | 'failed' | 'duplicate_detected' | 'skipped';
  attempts: number;
  error?: string;
  responseId?: string;
}


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

    const MAX_ATTEMPTS = 3;
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

        // Use original orchestration with bulk processing mode
        const orchestrationResult = await this.supabase.functions.invoke(
          'agent-orchestration-stream',
          {
            headers: { authorization: this.authHeader },
            body: {
              messageId: messageId,
              deliberationId: deliberationId,
              mode: 'bulk_processing'
            }
          }
        );

        if (orchestrationResult.error) {
          console.error(`❌ Orchestration attempt ${attempt} failed for message ${messageId}:`, orchestrationResult.error);
          
          if (attempt < MAX_ATTEMPTS) {
            const backoffDelay = Math.min(1000 * attempt, 3000); // Faster retries
            console.log(`⏳ Waiting ${backoffDelay}ms before retry attempt ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          } else {
            throw new Error(`All orchestration attempts failed: ${orchestrationResult.error.message}`);
          }
        }

        console.log(`✅ Orchestration completed for message ${messageId}`);

        // Wait longer for response to be fully committed to database
        console.log(`⏳ Waiting 3 seconds for response to be committed...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Single verification with longer wait
        console.log(`🔍 Verifying agent response for message ${messageId}`);
        const verificationResult = await this.hasExistingResponse(messageId, deliberationId);
        
        if (verificationResult.exists) {
          console.log(`✅ Agent response verified: ${verificationResult.responseId}`);
          return {
            messageId,
            status: 'success',
            attempts: attempt,
            responseId: verificationResult.responseId!
          };
        } else {
          console.error(`❌ No response found after orchestration for message ${messageId}, attempt ${attempt}`);
          
          if (attempt < MAX_ATTEMPTS) {
            console.log(`🔄 Will retry orchestration for message ${messageId}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          } else {
            throw new Error('Orchestration completed but no response was created after verification');
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
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();

    // Get the authorization header to verify admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('Missing authorization header', 401);
    }

    // Verify user is admin using JWT token
    const userAuthClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await userAuthClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return createErrorResponse('Invalid authorization', 401);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.user_role !== 'admin') {
      return createErrorResponse('Admin access required', 403);
    }

    const { batchId } = await parseAndValidateRequest(req, ['batchId']);

    if (!batchId) {
      return createErrorResponse('Missing batchId', 400);
    }

    console.log(`🚀 Starting HIGH-RELIABILITY agent response processing for batch: ${batchId}`);

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return createErrorResponse('Batch not found', 404);
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
      return createErrorResponse('Failed to fetch messages', 500);
    }

    if (!messages || messages.length === 0) {
      console.log('✅ No messages found awaiting agent responses');
      return createSuccessResponse({ 
        message: 'No messages found awaiting agent responses',
        batch_id: batchId
      });
    }

    console.log(`📊 Processing ${messages.length} messages with HIGH-RELIABILITY processing`);

    // Initialize processor
    const processor = new MessageProcessor(supabase, authHeader);
    
    // Process messages in larger batches for speed
    const BATCH_SIZE = 50;
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
        
        // Very small delay between messages for speed
        await new Promise(resolve => setTimeout(resolve, 500));
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

    return createSuccessResponse({
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
    });

  } catch (error) {
    console.error('💥 Critical error in process-bulk-agent-responses function:', error);
    return createErrorResponse(error, 500, 'process-bulk-agent-responses');
  }
});