-- Drop the current restrictive SELECT policy on participants
DROP POLICY IF EXISTS "Users can view participant records" ON participants;

-- Create new policy to allow users to see all participants in deliberations they're part of
CREATE POLICY "Users can view participants in their deliberations" 
ON participants 
FOR SELECT 
USING (
  is_authenticated_admin() OR
  deliberation_id IN (
    SELECT p2.deliberation_id 
    FROM participants p2 
    WHERE p2.user_id = (get_authenticated_user())::text
  )
);