-- Debug the session configuration issue
-- Create a debug function to see what's happening

CREATE OR REPLACE FUNCTION public.debug_current_user_settings()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'config_value', current_setting('app.current_user_id', true),
    'config_length', length(current_setting('app.current_user_id', true)),
    'config_is_null', current_setting('app.current_user_id', true) IS NULL,
    'config_is_empty', current_setting('app.current_user_id', true) = '',
    'auth_uid', auth.uid()
  );
$$;

-- Test it
SELECT debug_current_user_settings();

-- Also update the function to be more verbose about what it's checking
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
      ELSE auth.uid()
    END;
$$;