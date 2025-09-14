-- Create a debug function to see what's happening with our authentication functions
CREATE OR REPLACE FUNCTION public.debug_auth_functions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  access_code_header text;
  user_from_function uuid;
  user_direct uuid;
BEGIN
  -- Get access code from request header
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  -- Get user via our function
  user_from_function := get_current_access_code_user();
  
  -- Get user directly from query to see format
  SELECT ac.used_by INTO user_direct
  FROM access_codes ac
  WHERE ac.code = access_code_header 
    AND ac.is_active = true 
    AND ac.is_used = true;
  
  RETURN jsonb_build_object(
    'access_code_header', access_code_header,
    'user_from_function', user_from_function,
    'user_from_function_text', user_from_function::text,
    'user_direct', user_direct,
    'user_direct_text', user_direct::text
  );
END;
$function$

-- Fix get_authenticated_user to use the correct function without extra wrapping
CREATE OR REPLACE FUNCTION public.get_authenticated_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN get_current_access_code_user();
END;
$function$