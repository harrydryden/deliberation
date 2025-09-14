-- Drop the existing function and recreate it to return UUID instead of TEXT
DROP FUNCTION IF EXISTS public.get_current_access_code_user() CASCADE;

-- Create new function that returns the UUID from access_codes table
-- This way existing data with UUIDs will work correctly
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
        AND current_setting('app.current_user_id', true) != ''
        AND current_setting('app.current_user_id', true) != 'null'
        AND current_setting('app.current_user_id', true) LIKE 'access_%'
      THEN (
        SELECT used_by 
        FROM access_codes 
        WHERE code = SUBSTRING(current_setting('app.current_user_id', true) FROM 8)
        AND is_used = true
        LIMIT 1
      )
      ELSE NULL
    END;
$function$;

-- Recreate the dropped policies that depend on this function
-- Messages policies
CREATE POLICY "Users can only view their own messages" 
ON public.messages 
FOR SELECT 
TO public
USING (
  -- User ID should match the UUID returned by the function
  (user_id = get_current_access_code_user()::text) OR
  -- Admin override
  is_admin_access_code_user()
);

CREATE POLICY "Users can create messages as themselves" 
ON public.messages 
FOR INSERT 
TO public
WITH CHECK (
  (user_id IS NOT NULL) AND 
  (length(user_id) > 0) AND 
  (get_current_access_code_user() IS NOT NULL) AND 
  -- Ensure messages use the UUID format
  (user_id = get_current_access_code_user()::text)
);