-- Fix the type casting issue in RLS policies for messages and participants
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can create their own messages" ON messages;
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON messages;
DROP POLICY IF EXISTS "Users can create their own participant records" ON participants;
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;

-- Create fixed policies for messages with proper type casting
CREATE POLICY "Users can create their own messages" 
ON messages 
FOR INSERT
WITH CHECK (user_id = (get_current_access_code_user())::text);

-- Allow users to view messages in deliberations they participate in
CREATE POLICY "Users can view messages in their deliberations" 
ON messages 
FOR SELECT
USING (
  user_id = (get_current_access_code_user())::text
  OR 
  deliberation_id IN ( SELECT participants.deliberation_id
    FROM participants 
    WHERE participants.user_id = (get_current_access_code_user())::text
  )
);

-- Create fixed policies for participants with proper type casting
CREATE POLICY "Users can create their own participant records" 
ON participants 
FOR INSERT
WITH CHECK (user_id = (get_current_access_code_user())::text);

-- Allow users to view participant info for deliberations they're in
CREATE POLICY "Users can view participants in their deliberations" 
ON participants 
FOR SELECT
USING (
  user_id = (get_current_access_code_user())::text
  OR 
  deliberation_id IN ( SELECT p2.deliberation_id
    FROM participants p2 
    WHERE p2.user_id = (get_current_access_code_user())::text
  )
);