-- Fix the participants table RLS policy to allow users to see all participants in deliberations they're part of
DROP POLICY IF EXISTS "Users can view participants where they are participants" ON participants;

-- Create a new policy that allows users to see all participants in deliberations they're participating in
CREATE POLICY "Participants can view all participants in their deliberations" 
ON participants 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM participants p2 
    WHERE p2.deliberation_id = participants.deliberation_id 
    AND p2.user_id = auth.uid()
  ) 
  OR is_admin_user(auth.uid())
);