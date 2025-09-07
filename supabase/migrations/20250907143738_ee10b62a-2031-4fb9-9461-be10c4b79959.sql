-- Security Hardening Phase 3: Complete remaining function search path fixes
-- Focus on performance-neutral security improvements only

-- Fix remaining functions that still need search path security
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

CREATE OR REPLACE FUNCTION public.user_participates_in_deliberation_by_code(deliberation_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants 
    WHERE deliberation_id = deliberation_uuid 
    AND user_id = get_current_user_access_code()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  );
$$;