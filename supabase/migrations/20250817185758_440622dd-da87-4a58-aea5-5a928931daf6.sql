-- Fix the messages RLS policy to only allow users to see their own messages
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON public.messages;

CREATE POLICY "Users can only view their own messages" 
ON public.messages 
FOR SELECT 
USING (
  (user_id = (get_current_access_code_user())::text) OR 
  is_admin_access_code_user()
);

-- Keep the insert policy as is since it's working correctly
-- Users can create messages as themselves 
-- WITH CHECK: ((user_id IS NOT NULL) AND (length(user_id) > 0) AND (get_current_access_code_user() IS NOT NULL) AND ((user_id = (get_current_access_code_user())::text) OR (get_current_access_code_user() IS NULL)))