-- Create the session user ID function first
CREATE OR REPLACE FUNCTION public.get_current_session_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('request.headers.x-user-id', true);
$$;

-- Create new is_admin_user function that works with text user IDs
CREATE OR REPLACE FUNCTION public.is_admin_user(input_user_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id::text = COALESCE(input_user_id, get_current_session_user_id()) 
    AND user_role = 'admin'
  );
$$;