-- Fix admin access to all messages
-- Drop the existing admin policy and recreate it with a more direct approach
DROP POLICY IF EXISTS "Admins can manage all messages" ON messages;

-- Create a more robust admin policy that checks profiles table directly
CREATE POLICY "Admins can manage all messages" 
ON messages 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_role = 'admin'
  )
);

-- Also ensure admins can see all deliberation messages regardless of participation
CREATE POLICY "Admins can view all deliberation messages" 
ON messages 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.user_role = 'admin'
  )
);