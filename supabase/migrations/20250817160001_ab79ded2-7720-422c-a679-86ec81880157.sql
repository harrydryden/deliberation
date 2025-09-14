-- Fix the is_admin_user function to work properly
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND (role = 'admin' OR user_role = 'admin')
  );
$$;

-- Update the get_local_agents_admin function to use a more robust admin check
CREATE OR REPLACE FUNCTION get_local_agents_admin()
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  agent_type text,
  system_prompt text,
  goals text[],
  response_style text,
  is_active boolean,
  is_default boolean,
  deliberation_id uuid,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  preset_questions jsonb,
  facilitator_config jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get the current user's role
  SELECT COALESCE(p.role, p.user_role, 'user') INTO current_user_role
  FROM public.profiles p 
  WHERE p.id = auth.uid();

  -- Check if user is admin
  IF current_user_role != 'admin' THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required. Current role: %', current_user_role;
  END IF;

  RETURN QUERY
  SELECT 
    ac.id,
    ac.name,
    ac.description,
    ac.agent_type,
    ac.system_prompt,
    ac.goals,
    ac.response_style,
    ac.is_active,
    ac.is_default,
    ac.deliberation_id,
    ac.created_by,
    ac.created_at,
    ac.updated_at,
    ac.preset_questions,
    ac.facilitator_config
  FROM agent_configurations ac
  WHERE ac.deliberation_id IS NOT NULL;
END;
$$;