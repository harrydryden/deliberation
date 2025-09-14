-- Fix search path security issue for get_prompt_template function
CREATE OR REPLACE FUNCTION get_prompt_template(template_name text)
RETURNS TABLE(
  template_text text,
  variables jsonb,
  category text,
  version integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
$$;