-- Create function for knowledge similarity search
CREATE OR REPLACE FUNCTION match_agent_knowledge(
  agent_id uuid,
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  agent_id uuid,
  title text,
  content text,
  content_type text,
  file_name text,
  chunk_index int,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
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
  WHERE ak.agent_id = match_agent_knowledge.agent_id
    AND 1 - (ak.embedding <=> query_embedding) > match_threshold
  ORDER BY ak.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;