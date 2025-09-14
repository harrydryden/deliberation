-- Fix the get_current_access_code_user function to handle session configuration properly
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
        AND current_setting('app.current_user_id', true) != ''
        AND current_setting('app.current_user_id', true) != 'null'
      THEN current_setting('app.current_user_id', true)::uuid
      ELSE NULL
    END;
$$;

-- Update the Supabase client to use session-level configuration instead of local
-- This ensures the context persists across queries in the same session