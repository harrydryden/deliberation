-- Fix get_prompt_template function ambiguity by dropping the unused overloaded version
-- Keep only the version that's actually used by the agent orchestrator

DROP FUNCTION IF EXISTS public.get_prompt_template(text, jsonb);

-- Ensure the correct function exists and is optimized
CREATE OR REPLACE FUNCTION public.get_prompt_template(template_name text)
 RETURNS TABLE(template_text text, variables jsonb, category text, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    pt.template_text,
    pt.variables,
    pt.category::text,
    pt.version
  FROM prompt_templates pt
  WHERE pt.name = template_name AND pt.is_active = true
  ORDER BY pt.version DESC
  LIMIT 1;
END;
$function$;