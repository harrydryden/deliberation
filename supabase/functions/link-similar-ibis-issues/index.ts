import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest
} from '../shared/edge-function-utils';
import { EdgeLogger, withTimeout, withRetry } from '../shared/edge-logger';

interface RequestBody {
  deliberationId?: string;
  nodeId?: string;
  threshold?: number; // cosine similarity threshold (0..1)
  nodeType?: 'issue' | 'position' | 'argument';
}

// Cosine similarity for numeric arrays
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
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
      .select("id, deliberation_id, node_type, embedding, created_by")
      .eq("node_type", TYPE);

    if (deliberationId) query = query.eq("deliberation_id", deliberationId);
    if (nodeId) query = query.eq("id", nodeId);

    const { data: targetNodes, error: targetErr } = await query;
    if (targetErr) throw targetErr;

    // If single node specified, also fetch its peers in the same deliberation
    let peerNodes: any[] = [];
    if (nodeId) {
      const deliberation = targetNodes?.[0]?.deliberation_id;
      if (!deliberation) {
        return createSuccessResponse({ success: false, processed: 0, reason: "node_not_found" });
      }
      const { data: others, error: othersErr } = await supabase
        .from("ibis_nodes")
        .select("id, deliberation_id, node_type, embedding, created_by")
        .eq("node_type", TYPE)
        .eq("deliberation_id", deliberation)
        .neq("id", nodeId);
      if (othersErr) throw othersErr;
      peerNodes = others || [];
    }

    const nodes: any[] = nodeId ? [...targetNodes, ...peerNodes] : (targetNodes || []);
    const nodesWithEmb = nodes.filter((n: any) => Array.isArray(n.embedding) && n.embedding.length > 0);

    if (nodesWithEmb.length < 2) {
      return createSuccessResponse({ success: true, processed: 0, reason: "insufficient_embeddings" });
    }

    // Group by deliberation to avoid cross-deliberation links
    const byDelib = new Map<string, any[]>();
    for (const n of nodesWithEmb) {
      const key = n.deliberation_id;
      if (!byDelib.has(key)) byDelib.set(key, []);
      byDelib.get(key)!.push(n);
    }

    let created = 0;

    for (const [delibId, list] of byDelib.entries()) {
      const ids = list.map((n: any) => n.id);

      // Fetch existing supportive relationships for these nodes to avoid duplicates (either direction)
      const { data: existing, error: relErr } = await supabase
        .from("ibis_relationships")
        .select("source_node_id, target_node_id")
        .eq("deliberation_id", delibId)
        .eq("relationship_type", "supports")
        .in("source_node_id", ids);
      if (relErr) throw relErr;

      // Also fetch where these nodes appear as target
      const { data: existing2, error: relErr2 } = await supabase
        .from("ibis_relationships")
        .select("source_node_id, target_node_id")
        .eq("deliberation_id", delibId)
        .eq("relationship_type", "supports")
        .in("target_node_id", ids);
      if (relErr2) throw relErr2;

      const existingPairs = new Set<string>();
      for (const r of [...(existing || []), ...(existing2 || [])]) {
        const a = r.source_node_id as string;
        const b = r.target_node_id as string;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        existingPairs.add(key);
      }

      // Build candidate pairs above threshold
      const inserts: any[] = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const ni = list[i];
          const nj = list[j];
          const sim = cosineSim(ni.embedding as number[], nj.embedding as number[]);
          if (sim >= threshold) {
            const key = ni.id < nj.id ? `${ni.id}|${nj.id}` : `${nj.id}|${ni.id}`;
            if (!existingPairs.has(key)) {
              // Create a single directed edge with canonical ordering to avoid duplicates
              const source = ni.id < nj.id ? ni : nj;
              const target = ni.id < nj.id ? nj : ni;
              inserts.push({
                source_node_id: source.id,
                target_node_id: target.id,
                relationship_type: "supports",
                created_by: source.created_by || nj.created_by, // best effort
                deliberation_id: delibId,
              });
            }
          }
        }
      }

      // Insert in batches
      const BATCH = 500;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const batch = inserts.slice(i, i + BATCH);
        if (!batch.length) continue;
        const { error: insErr, count } = await supabase
          .from("ibis_relationships")
          .insert(batch)
          .select("id", { count: "exact" });
        if (insErr) throw insErr;
        created += count || batch.length;
      }
    }

    return createSuccessResponse({ success: true, created });
  } catch (error) {
    console.error("link-similar-ibis-issues error:", error);
    return createErrorResponse(error, 500, 'link-similar-ibis-issues');
  }
});
