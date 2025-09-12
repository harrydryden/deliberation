import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '@supabase/supabase-js';

// Inlined utilities to avoid cross-folder import issues
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

function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey)
  };
}

const EdgeLogger = {
  debug: (message: string, data?: any) => console.log(`🔍 ${message}`, data),
  info: (message: string, data?: any) => console.log(`ℹ️ ${message}`, data),
  error: (message: string, error?: any) => console.error(`❌ ${message}`, error),
};

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;

  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);

    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }

    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface RequestBody {
  deliberationId?: string;
  nodeId?: string;
  threshold?: number;
  nodeType?: 'issue' | 'position' | 'argument';
  force?: boolean;
}

interface SimilarityScore {
  id: string;
  similarity: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { deliberationId, nodeId, threshold = 0.83, nodeType } = await parseAndValidateRequest(req);

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();

    // Fetch target nodes with embeddings of the requested type
    const TYPE = nodeType || 'issue';
    let query = supabase
      .from("ibis_nodes")
      .select("id, title, description, node_type, embedding, deliberation_id")
      .eq("node_type", TYPE);

    if (deliberationId) query = query.eq("deliberation_id", deliberationId);
    if (nodeId) query = query.eq("id", nodeId);

    const { data: targetNodes, error: targetError } = await query;
    if (targetError) throw targetError;

    // Decide on the nodes to analyze
    let nodes = targetNodes || [];
    
    // If a specific node is requested, compare it against all other nodes in its deliberation
    if (nodeId) {
      const deliberation = targetNodes?.[0]?.deliberation_id;
      if (!deliberation) {
        return createSuccessResponse({ success: false, processed: 0, reason: "node_not_found" });
      }
      const { data: others, error: othersErr } = await supabase
        .from("ibis_nodes")
        .select("id, title, description, node_type, embedding, deliberation_id")
        .eq("deliberation_id", deliberation)
        .eq("node_type", TYPE)
        .neq("id", nodeId);
      if (othersErr) throw othersErr;
      nodes = [...targetNodes, ...(others || [])];
    }

    const nodesWithEmb = nodes.filter((n: any) => Array.isArray(n.embedding) && n.embedding.length > 0);

    if (nodesWithEmb.length < 2) {
      return createSuccessResponse({ success: true, processed: 0, reason: "insufficient_embeddings" });
    }

    // Group by deliberation to avoid cross-deliberation links
    const deliberationGroups = nodesWithEmb.reduce((acc, node) => {
      const key = node.deliberation_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(node);
      return acc;
    }, {} as Record<string, any[]>);

    let created = 0;
    for (const [deliberationId, groupNodes] of Object.entries(deliberationGroups)) {
      if (groupNodes.length < 2) continue;

      // Calculate similarities within the group
      const similarities: Array<{ from: any; to: any; similarity: number }> = [];
      
      for (let i = 0; i < groupNodes.length; i++) {
        for (let j = i + 1; j < groupNodes.length; j++) {
          const node1 = groupNodes[i];
          const node2 = groupNodes[j];
          const sim = cosineSimilarity(node1.embedding, node2.embedding);
          
          if (sim >= threshold) {
            similarities.push({ from: node1, to: node2, similarity: sim });
          }
        }
      }

      // Create relationships
      for (const { from, to, similarity } of similarities) {
        try {
          const { data: existing } = await supabase
            .from("ibis_relationships")
            .select("id")
            .or(`and(from_node_id.eq.${from.id},to_node_id.eq.${to.id}),and(from_node_id.eq.${to.id},to_node_id.eq.${from.id})`)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log(`Skipping existing relationship: ${from.id} <-> ${to.id}`);
            continue;
          }

          const { error: insertError } = await supabase
            .from("ibis_relationships")
            .insert({
              from_node_id: from.id,
              to_node_id: to.id,
              relationship_type: "similar_to",
              confidence_score: similarity,
              metadata: {
                source: "auto_similarity",
                similarity_score: similarity,
                threshold: threshold
              }
            });

          if (!insertError) {
            created++;
            console.log(`Created similarity link: ${from.title} -> ${to.title} (${similarity.toFixed(3)})`);
          } else {
            console.error(`Failed to create relationship:`, insertError);
          }
        } catch (error) {
          console.error(`Error processing relationship ${from.id} -> ${to.id}:`, error);
        }
      }
    }

    return createSuccessResponse({ success: true, created });
  } catch (error) {
    console.error("link-similar-ibis-issues error:", error);
    return createErrorResponse(error, 500, 'link-similar-ibis-issues');
  }
});