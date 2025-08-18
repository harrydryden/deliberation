-- Fix the inconsistent admin RLS policies for messages
DROP POLICY IF EXISTS "Access code admins can view all messages" ON messages;

-- Ensure all admin policies use the same pattern
CREATE POLICY "Access code admins can view all messages" 
ON messages 
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- Remove duplicate admin policies
DROP POLICY IF EXISTS "Admins can manage all messages" ON messages;

-- Update participants policies to match
DROP POLICY IF EXISTS "Access code admins can manage all participants" ON participants;

CREATE POLICY "Access code admins can manage all participants" 
ON participants 
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);