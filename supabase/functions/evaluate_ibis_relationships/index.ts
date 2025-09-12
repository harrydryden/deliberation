import { serve } from "std/http/server.ts";
import { createClient } from '@supabase/supabase-js';

const canonical = 'relationship_evaluator';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) {
    return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }

  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const method = req.method;
  const auth = req.headers.get('Authorization') || undefined;

  let body: any = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try { body = await req.json(); } catch { body = undefined; }
  }

  console.log(`[alias] evaluate_ibis_relationships -> ${canonical}`, { method });

  const { data, error } = await client.functions.invoke(canonical, {
    method,
    body,
    headers: auth ? { Authorization: auth } : undefined,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
  return new Response(JSON.stringify(data ?? { forwarded: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
});