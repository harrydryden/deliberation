-- Debug and fix the UUID parentheses issue in authentication functions
-- The problem is in how the get_authenticated_user function handles UUID conversion

-- Drop and recreate get_authenticated_user to ensure proper UUID handling
DROP FUNCTION IF EXISTS public.get_authenticated_user();

CREATE OR REPLACE FUNCTION public.get_authenticated_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  access_code_header text;
  user_uuid uuid;
BEGIN
  -- Get access code from request header (set by client)
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  IF access_code_header IS NULL OR access_code_header = '' THEN
    RETURN NULL;
  END IF;
  
  -- Look up user by access code and return UUID directly (not wrapped)
  SELECT used_by INTO user_uuid
  FROM access_codes 
  WHERE code = access_code_header 
    AND is_active = true 
    AND is_used = true;
  
  RETURN user_uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Also update is_authenticated_admin to be more robust
DROP FUNCTION IF EXISTS public.is_authenticated_admin();

CREATE OR REPLACE FUNCTION public.is_authenticated_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  access_code_header text;
  is_admin_code boolean := false;
BEGIN
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  IF access_code_header IS NULL OR access_code_header = '' THEN
    RETURN false;
  END IF;
  
  SELECT EXISTS(
    SELECT 1 FROM access_codes 
    WHERE code = access_code_header 
      AND code_type = 'admin' 
      AND is_active = true
  ) INTO is_admin_code;
  
  RETURN is_admin_code;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Test the current authentication by using a debug function
CREATE OR REPLACE FUNCTION public.debug_auth_context()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT jsonb_build_object(
    'access_code_header', current_setting('request.headers', true)::json->>'x-access-code',
    'authenticated_user', get_authenticated_user(),
    'is_admin', is_authenticated_admin(),
    'has_headers', current_setting('request.headers', true) IS NOT NULL
  );
$$;