-- Add missing admin policy for messages table
-- This will allow admins to view all messages in any deliberation
CREATE POLICY "Access code admins can view all messages" ON public.messages
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);