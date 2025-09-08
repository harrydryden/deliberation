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

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('Missing authorization header', 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
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

    console.log(`Retrying failed agent responses for batch: ${batchId}`);

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('bulk_import_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return createErrorResponse('Batch not found', 404);
    }

    // Reset failed messages back to awaiting_agent_response
    const { error: resetError } = await supabase
      .from('messages')
      .update({ bulk_import_status: 'awaiting_agent_response' })
      .eq('deliberation_id', batch.deliberation_id)
      .eq('bulk_import_status', 'failed');

    if (resetError) {
      console.error('Error resetting failed messages:', resetError);
      return createErrorResponse('Failed to reset messages', 500);
    }

    // Trigger the agent response processing
    const { data: processResult, error: processError } = await supabase.functions.invoke(
      'process-bulk-agent-responses',
      {
        headers: { authorization: authHeader },
        body: { batchId }
      }
    );

    if (processError) {
      console.error('Error triggering agent processing:', processError);
      return createErrorResponse('Failed to trigger agent processing', 500, 'retry-failed-agent-responses', { details: processError });
    }

    return createSuccessResponse({
      success: true,
      message: 'Failed agent responses reset and processing triggered',
      batch_id: batchId,
      process_result: processResult
    });

  } catch (error) {
    console.error('Error in retry-failed-agent-responses function:', error);
    return createErrorResponse(error, 500, 'retry-failed-agent-responses');
  }
});