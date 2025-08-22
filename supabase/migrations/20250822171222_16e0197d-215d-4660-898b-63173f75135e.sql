-- Drop the existing restrictive policy for creating agent configurations
DROP POLICY IF EXISTS "Users can create agent configurations in their deliberations" ON agent_configurations;

-- Create a new policy that allows admins to create agent configurations for any deliberation
-- and regular users to create them only in deliberations they participate in
CREATE POLICY "Users can create agent configurations" 
ON agent_configurations 
FOR INSERT 
WITH CHECK (
  is_authenticated_admin() OR 
  (
    deliberation_id IN (
      SELECT participants.deliberation_id
      FROM participants
      WHERE participants.user_id = (get_authenticated_user())::text
    ) AND created_by = get_authenticated_user()
  )
);

-- Also update the SELECT policy to be more permissive for admins
DROP POLICY IF EXISTS "Users can view agent configurations in their deliberations" ON agent_configurations;

CREATE POLICY "Users can view agent configurations" 
ON agent_configurations 
FOR SELECT 
USING (
  is_authenticated_admin() OR
  (deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = (get_authenticated_user())::text
  )) OR 
  (deliberation_id IS NULL)
);