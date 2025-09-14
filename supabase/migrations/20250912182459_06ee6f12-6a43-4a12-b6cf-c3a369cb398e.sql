-- Create function to find similar IBIS nodes based on query embedding
CREATE OR REPLACE FUNCTION public.match_ibis_nodes_for_query(
  query_embedding vector(1536),
  deliberation_uuid uuid,
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  node_type text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ibis_nodes.id,
    ibis_nodes.title,
    ibis_nodes.description,
    ibis_nodes.node_type::text,
    (1 - (ibis_nodes.embedding <=> query_embedding))::float as similarity
  FROM ibis_nodes
  WHERE ibis_nodes.deliberation_id = deliberation_uuid
    AND ibis_nodes.embedding IS NOT NULL
    AND (1 - (ibis_nodes.embedding <=> query_embedding)) > match_threshold
  ORDER BY ibis_nodes.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;