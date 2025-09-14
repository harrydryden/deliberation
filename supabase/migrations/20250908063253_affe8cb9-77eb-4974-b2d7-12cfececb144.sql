-- Fix the auth functions to use standard Supabase Auth instead of custom access codes
-- This replaces the implementation while keeping the function signatures

-- Replace get_authenticated_user() to use auth.uid() instead of access codes
CREATE OR REPLACE FUNCTION get_authenticated_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- Replace is_authenticated_admin() to use standard Supabase Auth
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