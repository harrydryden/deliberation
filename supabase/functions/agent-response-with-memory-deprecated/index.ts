/**
 * @deprecated This function is deprecated and will be removed in the next version.
 * Use agent-orchestration-stream for streaming responses with memory context.
 * 
 * This function is kept for backward compatibility only.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('⚠️  DEPRECATED: agent-response-with-memory function called. Please use agent-orchestration-stream instead.');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ 
    error: 'This function is deprecated. Please use agent-orchestration-stream for streaming responses with memory.',
    deprecated: true,
    migrateTo: 'agent-orchestration-stream'
  }), {
    status: 410, // Gone
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});