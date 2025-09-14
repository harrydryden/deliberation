-- Fix the participants INSERT policy to handle the access code user format properly
-- The current policy expects user_id to match get_current_access_code_user() but there might be a format mismatch

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can join deliberations" ON public.participants;

-- Create a new policy that handles the user_id format correctly
CREATE POLICY "Users can join deliberations"
ON public.participants
FOR INSERT
WITH CHECK (
  -- Allow users to join deliberations with their own user_id
  user_id = (get_current_access_code_user())::text OR
  -- Also allow if the user_id matches the access code format
  user_id = CONCAT('access_', get_current_user_access_code())
);