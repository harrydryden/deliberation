// DEPRECATED: This function has been replaced by agent-orchestration-stream
// Date deprecated: 2024-01-18
// Replacement: Use agent-orchestration-stream for all agent responses with memory

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    error: 'Function deprecated',
    message: 'This function has been deprecated. Please use agent-orchestration-stream instead.',
    migration: {
      newFunction: 'agent-orchestration-stream',
      deprecatedOn: '2024-01-18',
      reason: 'Consolidated into streaming orchestration system with integrated memory and caching'
    }
  }), {
    status: 410, // Gone
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});