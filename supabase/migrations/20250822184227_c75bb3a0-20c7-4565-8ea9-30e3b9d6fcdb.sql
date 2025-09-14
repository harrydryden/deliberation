-- Fix the admin_update_agent_configuration function to use proper authentication
CREATE OR REPLACE FUNCTION public.admin_update_agent_configuration(
  p_agent_id uuid, 
  p_updates jsonb
)
RETURNS TABLE(id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if current user is admin using the correct function
  IF NOT is_authenticated_admin() THEN
    RAISE EXCEPTION 'Admin access required for agent configuration updates';
  END IF;
  
  -- Update the agent configuration directly, bypassing RLS
  RETURN QUERY
  UPDATE agent_configurations 
  SET 
    name = COALESCE((p_updates->>'name')::text, name),
    description = COALESCE((p_updates->>'description')::text, description),
    agent_type = COALESCE((p_updates->>'agent_type')::text, agent_type),
    goals = CASE 
      WHEN p_updates ? 'goals' THEN 
        ARRAY(SELECT jsonb_array_elements_text(p_updates->'goals'))
      ELSE goals 
    END,
    response_style = COALESCE((p_updates->>'response_style')::text, response_style),
    is_active = COALESCE((p_updates->>'is_active')::boolean, is_active),
    is_default = COALESCE((p_updates->>'is_default')::boolean, is_default),
    preset_questions = COALESCE(p_updates->'preset_questions', preset_questions),
    facilitator_config = COALESCE(p_updates->'facilitator_config', facilitator_config),
    prompt_overrides = COALESCE(p_updates->'prompt_overrides', prompt_overrides),
    updated_at = now()
  WHERE agent_configurations.id = p_agent_id
  RETURNING agent_configurations.id, agent_configurations.updated_at;
  
  -- Log the admin action using the authenticated user
  PERFORM log_admin_action(
    'agent_configuration_update',
    'agent_configurations',
    p_agent_id,
    NULL, -- old_values not captured for performance
    p_updates
  );
END;
$$;