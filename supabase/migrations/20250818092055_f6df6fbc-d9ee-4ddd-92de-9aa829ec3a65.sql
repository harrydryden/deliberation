-- Add policies to allow users to create and view their own messages
CREATE POLICY "Users can create their own messages" 
ON messages 
FOR INSERT
WITH CHECK (user_id = get_current_access_code_user());

-- Allow users to view messages in deliberations they participate in
CREATE POLICY "Users can view messages in their deliberations" 
ON messages 
FOR SELECT
USING (
  user_id = get_current_access_code_user() 
  OR 
  EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = messages.deliberation_id 
    AND participants.user_id = get_current_access_code_user()
  )
);

-- Allow users to create participant records for themselves
CREATE POLICY "Users can create their own participant records" 
ON participants 
FOR INSERT
WITH CHECK (user_id = get_current_access_code_user());

-- Allow users to view participant info for deliberations they're in
CREATE POLICY "Users can view participants in their deliberations" 
ON participants 
FOR SELECT
USING (
  user_id = get_current_access_code_user() 
  OR 
  EXISTS (
    SELECT 1 FROM participants p2 
    WHERE p2.deliberation_id = participants.deliberation_id 
    AND p2.user_id = get_current_access_code_user()
  )
);