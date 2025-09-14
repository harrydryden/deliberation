-- Fix the admin RLS policy for messages 
-- Drop the incorrect policy
DROP POLICY IF EXISTS "Access code admins can view all messages" ON public.messages;

-- Create the correct admin policy that matches other admin policies in the system
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