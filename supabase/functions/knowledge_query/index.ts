import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// Lightweight knowledge query without LangChain to avoid boot failures.
// - Generates OpenAI embeddings
// - Uses Supabase RPC match_agent_knowledge for vector search
// - Falls back to text search if embedding/RPC fails

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } as const;
}

async function getEmbedding(openaiKey: string, input: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`OpenAI embeddings error: ${res.status} ${res.statusText} - ${msg}`);
  }
  const data = await res.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error("Invalid embedding response format");
  return vector as number[];
}

async function fallbackTextSearch(
  supabase: ReturnType<typeof createClient>,
  query: string,
  agentId?: string,
  maxResults = 5,
) {
  let q = supabase
    .from("agent_knowledge")
    .select("id, agent_id, title, content, content_type, file_name, chunk_index, metadata, created_at")
    .limit(maxResults);

  if (agentId) q = q.eq("agent_id", agentId);
  // Basic text search across title/content
  q = q.or(`title.ilike.%${query}%,content.ilike.%${query}%`);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    agent_id: r.agent_id,
    title: r.title,
    content: r.content,
    content_type: r.content_type,
    file_name: r.file_name,
    chunk_index: r.chunk_index,
    metadata: r.metadata,
    similarity: null as number | null,
    created_at: r.created_at,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const started = Date.now();
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = getEnv();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const query: string = (body?.query || "").toString().trim();
    const agentId: string | undefined = body?.agentId || body?.agent_id || undefined;
    const maxResults: number = Number(body?.maxResults ?? 5) || 5;
    const threshold: number = Number(body?.threshold ?? 0.35) || 0.35;

    if (!query) return jsonResponse({ error: "Missing required field: query" }, 400);

    // Infer default bill_agent if missing
    let effectiveAgentId = agentId;
    if (!effectiveAgentId) {
      const { data: ac, error: acErr } = await supabase
        .from("agent_configurations")
        .select("id, agent_type, is_default")
        .eq("agent_type", "bill_agent")
        .eq("is_default", true)
        .maybeSingle();
      if (!acErr && ac?.id) effectiveAgentId = ac.id;
    }

    // Vector search path
    try {
      const embedding = await getEmbedding(OPENAI_API_KEY, query);

      if (!effectiveAgentId) {
        const results = await fallbackTextSearch(supabase, query, undefined, maxResults);
        return jsonResponse({
          success: true,
          method: "text_fallback_no_agent",
          results,
          metadata: { durationMs: Date.now() - started, query: query.slice(0, 64) },
        });
      }

      const { data, error } = await supabase.rpc("match_agent_knowledge", {
        input_agent_id: effectiveAgentId,
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: maxResults,
      });
      if (error) throw error;

      const results = (data || []).map((r: any) => ({
        id: r.id,
        agent_id: r.agent_id,
        title: r.title,
        content: r.content,
        content_type: r.content_type,
        file_name: r.file_name,
        chunk_index: r.chunk_index,
        metadata: r.metadata,
        similarity: typeof r.similarity === "number" ? r.similarity : null,
        created_at: r.created_at,
      }));

      if (!results.length) {
        const fb = await fallbackTextSearch(supabase, query, effectiveAgentId, maxResults);
        return jsonResponse({
          success: true,
          method: "text_fallback_no_matches",
          results: fb,
          metadata: { durationMs: Date.now() - started, query: query.slice(0, 64), agent_id: effectiveAgentId },
        });
      }

      return jsonResponse({
        success: true,
        method: "vector_match",
        results,
        metadata: { durationMs: Date.now() - started, query: query.slice(0, 64), agent_id: effectiveAgentId },
      });
    } catch (vectorErr) {
      // Embedding/RPC failed — graceful fallback
      const results = await fallbackTextSearch(supabase, query, effectiveAgentId, maxResults);
      return jsonResponse({
        success: true,
        method: "text_fallback_error",
        results,
        metadata: {
          durationMs: Date.now() - started,
          query: query.slice(0, 64),
          agent_id: effectiveAgentId,
          error: (vectorErr as Error)?.message ?? String(vectorErr),
        },
      });
    }
  } catch (err) {
    console.error("knowledge_query fatal error", err);
    return jsonResponse({ success: false, results: [], error: (err as Error)?.message ?? String(err) }, 500);
  }
});