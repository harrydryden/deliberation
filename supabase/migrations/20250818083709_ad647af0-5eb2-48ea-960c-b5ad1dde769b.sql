-- Simplify the get_current_access_code_user function to just return the UUID from context
-- Since we're now always setting UUIDs in the context, this should be straightforward
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

-- Update the admin RLS policy to work with the simplified function
DROP POLICY IF EXISTS "Access code admins can view all messages" ON public.messages;

CREATE POLICY "Access code admins can view all messages" ON public.messages
FOR SELECT 
USING (
  -- Check if the current user UUID is linked to an admin access code
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE used_by = get_current_access_code_user()
    AND code_type = 'admin' 
    AND is_active = true
  )
);