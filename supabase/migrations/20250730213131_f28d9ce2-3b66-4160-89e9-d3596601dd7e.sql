-- Fix the remaining function (likely match_agent_knowledge)
CREATE OR REPLACE FUNCTION public.match_agent_knowledge(input_agent_id uuid, query_embedding vector, match_threshold double precision, match_count integer)
RETURNS TABLE(id uuid, agent_id uuid, title text, content text, content_type text, file_name text, chunk_index integer, metadata jsonb, similarity double precision, created_at timestamp with time zone)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.id,
    ak.agent_id,
    ak.title,
    ak.content,
    ak.content_type,
    ak.file_name,
    ak.chunk_index,
    ak.metadata,
    1 - (ak.embedding <=> query_embedding) AS similarity,
    ak.created_at
  FROM agent_knowledge ak
  WHERE ak.agent_id = input_agent_id
    AND 1 - (ak.embedding <=> query_embedding) > match_threshold
  ORDER BY ak.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;