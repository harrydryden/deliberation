-- Debug: Create a simple test function to check what context values are available
CREATE OR REPLACE FUNCTION debug_storage_context()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'current_user_id', current_setting('app.current_user_id', true),
    'current_access_code', current_setting('app.current_access_code', true),
    'current_user_id_is_null', current_setting('app.current_user_id', true) IS NULL,
    'current_access_code_is_null', current_setting('app.current_access_code', true) IS NULL,
    'get_current_access_code_user_result', get_current_access_code_user(),
    'get_current_user_access_code_result', get_current_user_access_code()
  );
$$;