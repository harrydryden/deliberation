-- Improve match_ibis_nodes_for_query function for better similarity calculation
CREATE OR REPLACE FUNCTION public.match_ibis_nodes_for_query(
  query_embedding vector, 
  deliberation_uuid uuid, 
  match_threshold double precision DEFAULT 0.35, 
  match_count integer DEFAULT 5
)
RETURNS TABLE(id uuid, title text, description text, node_type text, similarity double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ibis_nodes.id,
    ibis_nodes.title,
    ibis_nodes.description,
    ibis_nodes.node_type::text,
    -- Use explicit cosine similarity calculation for better accuracy
    (1 - (ibis_nodes.embedding <=> query_embedding))::double precision as similarity
  FROM ibis_nodes
  WHERE ibis_nodes.deliberation_id = deliberation_uuid
    AND ibis_nodes.embedding IS NOT NULL
    AND (1 - (ibis_nodes.embedding <=> query_embedding)) > match_threshold
  ORDER BY ibis_nodes.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;

-- Add HNSW index for better vector search performance if not exists
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_embedding_hnsw 
ON ibis_nodes USING hnsw (embedding vector_cosine_ops);