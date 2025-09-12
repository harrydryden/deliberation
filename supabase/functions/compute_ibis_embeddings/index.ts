import "xhr";
import { serve } from "std/http/server.ts";

// Import shared utilities for performance and consistency
// Self-contained utilities (inlined to avoid path resolution issues)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] ${context || 'Edge Function'} Error:`, error);
  
  return new Response(
    JSON.stringify({
      error: error?.message || 'An unexpected error occurred',
      errorId,
      context,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    return body as T;
  } catch (error: any) {
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}

function getOpenAIKey(): string {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return apiKey;
}

async function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  return { supabase };
}

interface RequestBody {
  deliberationId?: string;
  nodeId?: string;
  force?: boolean;
  nodeType?: 'issue' | 'position' | 'argument';
}

serve(async (req) => {
  // Handle CORS preflight with shared utility - retry deployment 2025-01-10
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await parseAndValidateRequest(req, ['deliberationId']);
    const { deliberationId, nodeId, force = false, nodeType } = body || {};

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();
    
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
          Authorization: `Bearer ${openAIApiKey}`,
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

    return createSuccessResponse({ 
      success: true, 
      processed: updated, 
      total: targets.length 
    });
  } catch (error) {
    console.error("compute-ibis-embeddings error:", error);
    return createErrorResponse(error, 500, 'compute-ibis-embeddings');
  }
});
