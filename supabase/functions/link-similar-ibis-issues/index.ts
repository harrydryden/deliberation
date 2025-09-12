import "xhr";
import { serve } from "std/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest
} from '../shared/edge-function-utils.ts';
import { EdgeLogger, withTimeout, withRetry } from '../shared/edge-logger.ts';

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