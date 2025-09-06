-- Fix the get_local_agents_admin function to remove non-existent updated_at column
CREATE OR REPLACE FUNCTION public.get_local_agents_admin()
 RETURNS TABLE(id uuid, name text, description text, agent_type text, goals text[], response_style text, is_active boolean, is_default boolean, deliberation_id uuid, created_by uuid, created_at timestamp with time zone, preset_questions jsonb, facilitator_config jsonb, prompt_overrides jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;