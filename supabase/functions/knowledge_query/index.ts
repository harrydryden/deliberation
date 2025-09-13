import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// Simplified, stable knowledge query without LangChain to avoid boot errors
// Returns { results: Array<{ id, title, content, similarity }> }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

class EdgeLogger {
  static fmt(level: string, message: string, data?: any) {
    const ts = new Date().toISOString();
    const d = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${ts}] [${level}] ${message}${d}`;
  }
  static debug(m: string, d?: any) { console.log(this.fmt('DEBUG', m, d)); }
  static info(m: string, d?: any) { console.log(this.fmt('INFO', m, d)); }
  static warn(m: string, d?: any) { console.warn(this.fmt('WARN', m, d)); }
  static error(m: string, d?: any) { console.error(this.fmt('ERROR', m, d)); }
}

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function parseBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch (e) {
    throw new Error('Invalid JSON body');
  }
}

function requireEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiApiKey) missing.push('OPENAI_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return { supabaseUrl, supabaseServiceKey, openaiApiKey };
}

async function embedText(openaiApiKey: string, input: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embeddings API error: ${res.status} ${t}`);
  }
  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!embedding) throw new Error('No embedding returned');
  return embedding;
}

serve(async (req) => {
  const pre = handleCORSPreflight(req);
  if (pre) return pre;

  const start = Date.now();
  try {
    EdgeLogger.info('Knowledge query called', { method: req.method, url: req.url });
    const body = await parseBody(req);

    const query: string = body?.query;
    const agentId: string | undefined = body?.agentId; // optional for now
    const maxResults: number = body?.maxResults ?? 5;
    const threshold: number = body?.threshold ?? 0.35;

    if (!query) {
      return jsonResponse({ error: 'Missing required field: query' }, 400);
    }

    const { supabaseUrl, supabaseServiceKey, openaiApiKey } = requireEnv();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Compute embedding for the query
    const embedding = await embedText(openaiApiKey, query);

    // Try to infer agent context if not provided by picking default bill agent
    let effectiveAgentId = agentId;
    if (!effectiveAgentId) {
      const { data: ac } = await supabase
        .from('agent_configurations')
        .select('id')
        .eq('agent_type', 'bill_agent')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      effectiveAgentId = ac?.id || null;
    }

    // If no agent id, we still try to search across all agent knowledge
    let matches: any[] = [];
    if (effectiveAgentId) {
      const { data, error } = await supabase.rpc('match_agent_knowledge', {
        input_agent_id: effectiveAgentId,
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: maxResults
      });
      if (error) throw error;
      matches = data || [];
    } else {
      // Fallback: broad search using agent_knowledge table similarity if RPC requires agent
      const { data, error } = await supabase
        .from('agent_knowledge')
        .select('id, title, content, similarity:embedding')
        .limit(0); // no cross-agent search implemented
      if (error) EdgeLogger.warn('Broad search not implemented, returning empty', error);
      matches = [];
    }

    const results = matches.map((m: any) => ({
      id: m.id,
      agent_id: m.agent_id,
      title: m.title,
      content: m.content,
      similarity: m.similarity
    }));

    EdgeLogger.info('Knowledge query completed', {
      results: results.length,
      processingTimeMs: Date.now() - start
    });

    return jsonResponse({
      success: true,
      results,
      metadata: {
        processingTimeMs: Date.now() - start
      }
    });
  } catch (error: any) {
    EdgeLogger.error('Knowledge query failed', { error: error.message });
    return jsonResponse({ success: false, results: [], error: error.message, metadata: { processingTimeMs: Date.now() - start } }, 200);
  }
});