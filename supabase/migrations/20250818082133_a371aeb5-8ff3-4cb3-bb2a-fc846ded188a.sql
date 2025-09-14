-- Fix the RLS policy for messages table to work with access code authentication
-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;

-- Create a new, corrected policy for message creation
CREATE POLICY "Users can create their own messages" ON public.messages
FOR INSERT 
WITH CHECK (
  -- Allow if user_id matches the current access code user
  user_id = (get_current_access_code_user())::text
  -- Or if this is a deliberation participant
  AND deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (get_current_access_code_user())::text
  )
);

-- Also ensure the existing SELECT policy works correctly
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON public.messages;

CREATE POLICY "Users can view messages in their deliberations" ON public.messages
FOR SELECT 
USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (get_current_access_code_user())::text
  )
);

-- Ensure users can update their own messages (for IBIS submission status)
CREATE POLICY "Users can update their own messages" ON public.messages
FOR UPDATE 
USING (user_id = (get_current_access_code_user())::text)
WITH CHECK (user_id = (get_current_access_code_user())::text);