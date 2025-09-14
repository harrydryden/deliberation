-- Fix RLS functions by dropping dependent policies first

-- Drop policies that depend on get_current_access_code_user
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow message creation with valid user_id" ON public.messages;

-- Now drop the function
DROP FUNCTION IF EXISTS public.get_current_access_code_user();

-- Recreate the get_current_access_code_user function to return proper UUID
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Return the current user ID that was set by the enhanced Supabase client
  SELECT CASE 
    WHEN current_setting('app.current_user_id', true) IS NOT NULL 
      AND current_setting('app.current_user_id', true) != ''
    THEN current_setting('app.current_user_id', true)::uuid
    ELSE NULL
  END;
$$;

-- Update is_admin_access_code_user to check admin role by user ID
CREATE OR REPLACE FUNCTION public.is_admin_access_code_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    JOIN access_codes ac ON ac.used_by = p.id
    WHERE p.id = get_current_access_code_user() 
    AND ac.code_type = 'admin' 
    AND ac.is_active = true
    AND ac.is_used = true
  );
$$;

-- Recreate profiles RLS policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (id = get_current_access_code_user());

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (id = get_current_access_code_user())
WITH CHECK (id = get_current_access_code_user());

-- Recreate messages RLS policy
CREATE POLICY "Allow message creation with valid user_id" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  user_id IS NOT NULL 
  AND length(user_id) > 0 
  AND get_current_access_code_user() IS NOT NULL
);