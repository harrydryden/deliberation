-- Fix RLS policies to match expected behavior:
-- Users should only see their own messages, not other users' messages in the same deliberation
-- Admins should see all messages
-- Peer agents will handle showing other users' content via IBIS

-- Drop the current policy that allows users to see all messages in a deliberation
DROP POLICY IF EXISTS "Users can view messages in deliberations they join" ON messages;

-- Create a restrictive policy: users can only see their own messages
CREATE POLICY "Users can only view their own messages" 
ON messages 
FOR SELECT
USING (
  user_id = (get_current_access_code_user())::text
  OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = get_current_access_code_user() 
    AND (role = 'admin' OR user_role = 'admin')
  )
);

-- Ensure the INSERT policy is correct (users can only create their own messages)
-- This should already exist but let's verify it's correct
DROP POLICY IF EXISTS "Users can create their own messages" ON messages;
CREATE POLICY "Users can create their own messages" 
ON messages 
FOR INSERT
WITH CHECK (user_id = (get_current_access_code_user())::text);