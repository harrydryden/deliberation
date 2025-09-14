-- Fix the messages RLS policy to allow users to see messages in deliberations they participate in
-- The current policy is too complex and may be causing issues

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can only see their own messages and deliberation messages" ON messages;

-- Create a simpler, more direct policy
CREATE POLICY "Users can view messages in their deliberations" 
ON messages 
FOR SELECT 
USING (
  -- Allow if user_id matches the current session user
  (user_id = (get_current_access_code_user())::text) 
  OR 
  -- Allow if user participates in the deliberation
  (deliberation_id IS NOT NULL AND user_participates_in_deliberation(deliberation_id, get_current_access_code_user()))
  OR 
  -- Allow for admins
  is_admin_access_code_user()
);

-- Test the policy by checking if we can see messages
SELECT COUNT(*) as visible_messages FROM messages WHERE deliberation_id = 'dd21813f-8935-40f3-b352-55a4491dd584';