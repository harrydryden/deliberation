-- Create a robust access code authentication system that works with Supabase
-- This replaces the problematic session variable approach

-- 1. Create a simple function that gets the current authenticated user from a header
CREATE OR REPLACE FUNCTION get_authenticated_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  access_code_header text;
  user_record record;
BEGIN
  -- Get access code from request header (set by client)
  access_code_header := current_setting('request.headers', true)::json->>'x-access-code';
  
  IF access_code_header IS NULL OR access_code_header = '' THEN
    RETURN NULL;
  END IF;
  
  -- Look up user by access code
  SELECT ac.used_by INTO user_record
  FROM access_codes ac
  WHERE ac.code = access_code_header 
    AND ac.is_active = true 
    AND ac.is_used = true;
  
  RETURN user_record;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 2. Create a function to check if current user is admin
CREATE OR REPLACE FUNCTION is_authenticated_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER  
SET search_path = public
AS $$
DECLARE
  access_code_header text;
  is_admin_code boolean;
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