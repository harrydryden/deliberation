-- Fix the messages table RLS policy for INSERT operations
-- First, drop the existing problematic INSERT policy
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;

-- Create a corrected INSERT policy that properly checks access code authentication
CREATE POLICY "Users can create their own messages" ON public.messages
FOR INSERT 
WITH CHECK (
  user_id = (get_current_access_code_user())::text
);