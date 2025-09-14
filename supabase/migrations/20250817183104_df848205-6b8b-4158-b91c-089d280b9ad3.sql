-- Fix the get_current_access_code_user function to properly return the current user ID
-- The issue is that this function is returning null, preventing users from seeing messages

-- First, let's check what functions exist and their definitions
SELECT proname, prosrc FROM pg_proc WHERE proname LIKE '%current%user%';

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.get_current_access_code_user();

-- Create a new function that properly gets the current user ID from the session configuration
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- Try to get from session config first
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
      THEN current_setting('app.current_user_id', true)::uuid
      ELSE NULL
    END,
    -- Fallback to auth.uid() if available
    auth.uid()
  );
$$;

-- Test the function
SELECT get_current_access_code_user() as test_current_user;