-- Create a simple admin function to update agent configurations
-- This bypasses RLS by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION admin_update_agent_configuration(
  p_agent_id uuid,
  p_access_code text,
  p_updates jsonb
)
RETURNS TABLE(id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  access_code_valid boolean;
  code_type_result text;
BEGIN
  -- Validate access code is admin type
  SELECT 
    CASE WHEN ac.code_type = 'admin' AND ac.is_active = true THEN true ELSE false END,
    ac.code_type
  INTO access_code_valid, code_type_result
  FROM access_codes ac
  WHERE ac.code = p_access_code AND ac.is_active = true;
  
  IF NOT access_code_valid OR code_type_result != 'admin' THEN
    RAISE EXCEPTION 'Admin access required for agent updates';
  END IF;
  
  -- Update the agent configuration directly, bypassing RLS
  RETURN QUERY
  UPDATE agent_configurations 
  SET 
    name = COALESCE((p_updates->>'name')::text, name),
    description = COALESCE((p_updates->>'description')::text, description),
    agent_type = COALESCE((p_updates->>'agent_type')::text, agent_type),
    system_prompt = COALESCE((p_updates->>'system_prompt')::text, system_prompt),
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
    updated_at = now()
  WHERE agent_configurations.id = p_agent_id
  RETURNING agent_configurations.id, agent_configurations.updated_at;
END;
$$;