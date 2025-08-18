-- Also fix get_current_user_access_code to return proper text format
CREATE OR REPLACE FUNCTION public.get_current_user_access_code()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  access_code_header text;
BEGIN
  -- Get access code from request header
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  RETURN access_code_header;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;