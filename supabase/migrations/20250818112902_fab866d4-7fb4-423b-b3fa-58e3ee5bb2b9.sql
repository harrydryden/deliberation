-- Create completely new, simplified authentication functions to avoid UUID formatting issues
CREATE OR REPLACE FUNCTION public.get_current_user_id_clean()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  access_code_header text;
  user_id_result text;
BEGIN
  -- Get access code from request header
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  IF access_code_header IS NULL OR access_code_header = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get user ID as text to avoid UUID formatting issues
  SELECT ac.used_by::text INTO user_id_result
  FROM access_codes ac
  WHERE ac.code = access_code_header 
    AND ac.is_active = true 
    AND ac.is_used = true;
  
  RETURN user_id_result;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$

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