-- Fix the get_current_access_code_user function
-- Replace the existing function body without dropping it

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
        AND current_setting('app.current_user_id', true) != ''
      THEN current_setting('app.current_user_id', true)::uuid
      ELSE NULL
    END,
    -- Fallback to auth.uid() if available
    auth.uid()
  );
$$;

-- Test the function
SELECT get_current_access_code_user() as test_current_user;