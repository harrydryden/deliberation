import { serve } from "std/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      message: 'Test function working',
      timestamp: new Date().toISOString(),
      function: 'test_entrypoint'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});