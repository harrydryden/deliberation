-- Fix the get_current_access_code_user function to return proper UUID format
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  access_code_header text;
  user_uuid uuid;
BEGIN
  -- Get access code from request header
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  IF access_code_header IS NULL OR access_code_header = '' THEN
    RETURN NULL;
  END IF;
  
  -- Look up user by access code and return clean UUID
  SELECT ac.used_by INTO user_uuid
  FROM access_codes ac
  WHERE ac.code = access_code_header 
    AND ac.is_active = true 
    AND ac.is_used = true;
  
  RETURN user_uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$

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
$function$