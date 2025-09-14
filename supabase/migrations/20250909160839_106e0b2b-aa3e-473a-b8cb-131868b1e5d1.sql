-- Fix the get_prompt_template function to return properly typed columns
DROP FUNCTION IF EXISTS get_prompt_template(text);

CREATE OR REPLACE FUNCTION get_prompt_template(template_name text)
RETURNS TABLE(
  template_text text,
  variables jsonb,
  category text,
  version integer
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.template_text,
    pt.variables,
    pt.category::text,  -- Cast varchar(100) to text to match return type
    pt.version
  FROM prompt_templates pt
  WHERE pt.name = template_name AND pt.is_active = true
  ORDER BY pt.version DESC
  LIMIT 1;
END;
$$;