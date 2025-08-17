-- Update RLS policy to use the new access_ prefix format as the standard
DROP POLICY IF EXISTS "Users can only view their own messages" ON public.messages;

CREATE POLICY "Users can only view their own messages" 
ON public.messages 
FOR SELECT 
TO public
USING (
  -- User ID should match the access_ prefix format
  (user_id = get_current_access_code_user()::text) OR
  -- Admin override
  is_admin_access_code_user()
);

-- Update the INSERT policy to ensure new messages use the access_ format
DROP POLICY IF EXISTS "Users can create messages as themselves" ON public.messages;

CREATE POLICY "Users can create messages as themselves" 
ON public.messages 
FOR INSERT 
TO public
WITH CHECK (
  (user_id IS NOT NULL) AND 
  (length(user_id) > 0) AND 
  (get_current_access_code_user() IS NOT NULL) AND 
  -- Ensure messages use access_ prefix format
  (user_id = get_current_access_code_user()::text)
);