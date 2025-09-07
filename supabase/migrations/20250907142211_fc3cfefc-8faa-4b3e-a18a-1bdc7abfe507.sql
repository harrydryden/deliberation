-- Security Hardening Phase 2: Fix remaining function search path vulnerabilities

-- Continue fixing search paths for remaining functions
CREATE OR REPLACE FUNCTION public.get_current_user_deliberation_ids()
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = (auth.uid())::text;
$$;

CREATE OR REPLACE FUNCTION public.get_authenticated_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_message_rating_summary(message_uuid uuid, user_uuid uuid)
RETURNS TABLE(total_ratings bigint, helpful_count bigint, unhelpful_count bigint, user_rating integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_ratings,
    COUNT(*) FILTER (WHERE rating = 1)::BIGINT as helpful_count,
    COUNT(*) FILTER (WHERE rating = -1)::BIGINT as unhelpful_count,
    COALESCE(
      (SELECT rating FROM agent_ratings WHERE message_id = message_uuid AND user_id = user_uuid LIMIT 1),
      0
    )::INTEGER as user_rating
  FROM agent_ratings
  WHERE message_id = message_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_prompt_template(template_name text, template_variables jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(template_text text, variables jsonb, category text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT pt.template_text, pt.variables, pt.category, pt.version
  FROM prompt_templates pt
  WHERE pt.name = template_name AND pt.is_active = true
  ORDER BY pt.version DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_local_agents_admin()
RETURNS TABLE(id uuid, name text, description text, agent_type text, goals text[], response_style text, is_active boolean, is_default boolean, deliberation_id uuid, created_by uuid, created_at timestamp with time zone, preset_questions jsonb, facilitator_config jsonb, prompt_overrides jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ac.id,
    ac.name,
    ac.description,
    ac.agent_type,
    ac.goals,
    ac.response_style,
    ac.is_active,
    ac.is_default,
    ac.deliberation_id,
    ac.created_by,
    ac.created_at,
    ac.preset_questions,
    ac.facilitator_config,
    ac.prompt_overrides
  FROM agent_configurations ac
  WHERE ac.deliberation_id IS NOT NULL;
$$;