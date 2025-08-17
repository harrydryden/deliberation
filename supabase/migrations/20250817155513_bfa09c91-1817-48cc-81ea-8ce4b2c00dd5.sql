-- Create a function to get local agents for admin users
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;