-- Update get_current_access_code_user function to handle only access_ format
-- First create the new function with a different name
CREATE OR REPLACE FUNCTION public.get_current_access_code_user_new()
RETURNS text
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
      THEN current_setting('app.current_user_id', true)
      ELSE NULL
    END;
$function$;

-- Drop and recreate all dependent policies to use the new function
-- Messages policies
DROP POLICY IF EXISTS "Users can only view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages as themselves" ON public.messages;

-- Now drop the old function
DROP FUNCTION IF EXISTS public.get_current_access_code_user() CASCADE;

-- Rename the new function to the original name
ALTER FUNCTION public.get_current_access_code_user_new() RENAME TO get_current_access_code_user;

-- Recreate the messages policies with the updated function
CREATE POLICY "Users can only view their own messages" 
ON public.messages 
FOR SELECT 
TO public
USING (
  -- User ID should be in access_ format
  (user_id = get_current_access_code_user()) OR
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
  -- Ensure messages use access_ prefix format
  (user_id = get_current_access_code_user())
);