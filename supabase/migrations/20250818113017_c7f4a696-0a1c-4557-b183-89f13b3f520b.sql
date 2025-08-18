-- Create a clean admin check function
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  access_code_header text;
BEGIN
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  IF access_code_header IS NULL OR access_code_header = '' THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS(
    SELECT 1 FROM access_codes 
    WHERE code = access_code_header 
      AND code_type = 'admin' 
      AND is_active = true
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;