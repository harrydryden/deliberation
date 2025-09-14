-- Replace custom access code auth functions with standard Supabase Auth functions
-- This fixes the auth inconsistencies across the codebase

-- Drop the old custom auth functions
DROP FUNCTION IF EXISTS get_authenticated_user();
DROP FUNCTION IF EXISTS is_authenticated_admin();

-- Create standard Supabase Auth functions
CREATE OR REPLACE FUNCTION get_authenticated_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- Create admin check function using standard Supabase Auth
CREATE OR REPLACE FUNCTION is_authenticated_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND user_role = 'admin'::app_role
  );
$$;

-- Update auth_is_admin function to be consistent (it already exists but let's ensure it's correct)
CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND user_role = 'admin'::app_role
  );
$$;