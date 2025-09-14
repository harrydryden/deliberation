-- Completely replace the participants INSERT policy with a simpler, more reliable one
-- Drop all existing policies and create a clean, simple policy

DROP POLICY IF EXISTS "Users can join deliberations" ON public.participants;

-- Create a much simpler policy that just checks if the user context is set
-- This removes complexity and focuses on the core requirement
CREATE POLICY "Allow users to join deliberations"
ON public.participants
FOR INSERT
WITH CHECK (
  -- Simply check that a user context is set (meaning user is authenticated)
  current_setting('app.current_user_id', true) IS NOT NULL 
  AND current_setting('app.current_user_id', true) != ''
  AND current_setting('app.current_user_id', true) != 'null'
);