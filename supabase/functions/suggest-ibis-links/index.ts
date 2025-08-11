import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.52.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  deliberationId: string;
  content: string;
  targetType: "issue" | "position" | "argument";
  threshold?: number; // 0..1, default 0.95
}

function cosineSim(a: number[], b: number[]) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { deliberationId, content, targetType, threshold = 0.95 } = body;
    if (!deliberationId || !content || !targetType) {
      return new Response(JSON.stringify({ success: false, error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ success: false, error: "OPENAI_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize clients
    // deno-lint-ignore no-explicit-any
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.53.1");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // Fetch candidate nodes of same type with embeddings
    const { data: nodes, error: nodesErr } = await supabase
      .from("ibis_nodes")
      .select("id, title, embedding")
      .eq("deliberation_id", deliberationId)
      .eq("node_type", targetType)
      .not("embedding", "is", null)
      .limit(5000);
    if (nodesErr) throw nodesErr;

    if (!nodes || nodes.length === 0) {
      return new Response(JSON.stringify({ success: true, suggestion: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute embedding for provided content
    const openai = new OpenAI({ apiKey: openaiKey });
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content.slice(0, 8000),
    });
    const queryVec = embedRes.data[0]?.embedding as number[];

    // Compute best match
    let best: { id: string; title: string; score: number } | null = null;
    for (const n of nodes) {
      const emb = (n as any).embedding as number[] | null;
      if (!emb) continue;
      const score = cosineSim(queryVec, emb);
      if (!best || score > best.score) {
        best = { id: (n as any).id as string, title: (n as any).title as string, score };
      }
    }

    if (!best || best.score < threshold) {
      return new Response(JSON.stringify({ success: true, suggestion: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, suggestion: best }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("suggest-ibis-links error", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
