-- Temporarily simplify agent_configurations policies for admin access
-- Remove the problematic policy that references participants table
DROP POLICY IF EXISTS "Participants can view deliberation-specific configurations" ON agent_configurations;

-- Create a simpler policy for admin access
CREATE POLICY "Admin users can manage all agent configurations" 
ON agent_configurations 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'user_role' = 'admin'
  )
);