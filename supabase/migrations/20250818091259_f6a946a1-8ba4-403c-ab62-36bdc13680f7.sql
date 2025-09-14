-- Create a simpler admin bypass for the messages table that works with the current auth system
-- Drop the complex policies and create a simpler admin-friendly approach

DROP POLICY IF EXISTS "Access code admins can view all messages" ON messages;

-- Create a policy that allows access based on user role in profiles table
CREATE POLICY "Admins can view all messages via profile" 
ON messages 
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = get_current_access_code_user() 
    AND (role = 'admin' OR user_role = 'admin')
  )
);

-- Also ensure admins can manage all messages
CREATE POLICY "Admins can manage all messages via profile" 
ON messages 
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = get_current_access_code_user() 
    AND (role = 'admin' OR user_role = 'admin')
  )
);

-- Same approach for participants
DROP POLICY IF EXISTS "Access code admins can manage all participants" ON participants;

CREATE POLICY "Admins can manage all participants via profile" 
ON participants 
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = get_current_access_code_user() 
    AND (role = 'admin' OR user_role = 'admin')
  )
);