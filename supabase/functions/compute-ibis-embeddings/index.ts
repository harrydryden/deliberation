import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface RequestBody {
  deliberationId?: string;
  nodeId?: string;
  force?: boolean;
  nodeType?: 'issue' | 'position' | 'argument';
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { deliberationId, nodeId, force = false, nodeType } = body || {};

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing Supabase configuration");
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY secret");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    
    // Build query to select target nodes of a given type
    const TYPE = nodeType || 'issue';
    let query = supabase
      .from("ibis_nodes")
      .select("id, title, description, node_type, embedding")
      .eq("node_type", TYPE);

    if (deliberationId) query = query.eq("deliberation_id", deliberationId);
    if (nodeId) query = query.eq("id", nodeId);

    const { data: nodes, error: nodesError } = await query;
    if (nodesError) throw nodesError;

    const targets = (nodes || []).filter((n: any) => force || !n.embedding);

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, skipped: nodes?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare embedding inputs
    const inputs = targets.map((n: any) => {
      const base = n.title || "";
      const desc = n.description ? `\n\n${n.description}` : "";
      // Keep prompt concise for embedding
      return (base + desc).slice(0, 2000);
    });

    // Call OpenAI embeddings API in batches to be safe
    const BATCH = 64; // text-embedding-3-small allows large batch; keep modest
    const embeddings: number[][] = [];
    for (let i = 0; i < inputs.length; i += BATCH) {
      const batch = inputs.slice(i, i + BATCH);
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`OpenAI embeddings error: ${res.status} ${t}`);
      }
      const json = await res.json();
      for (const item of json.data) embeddings.push(item.embedding as number[]);
    }

    // Update rows with embeddings
    let updated = 0;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const vector = embeddings[i];
      const { error } = await supabase
        .from("ibis_nodes")
        .update({ embedding: vector, updated_at: new Date().toISOString() })
        .eq("id", target.id);
      if (!error) updated++;
    }

    return new Response(
      JSON.stringify({ success: true, processed: updated, total: targets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("compute-ibis-embeddings error:", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
