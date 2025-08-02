-- Add RLS policy to allow participants to read agent configurations for their deliberations
CREATE POLICY "Participants can read agent configurations for their deliberations" 
ON agent_configurations 
FOR SELECT 
USING (
  deliberation_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = agent_configurations.deliberation_id 
    AND participants.user_id = auth.uid()
  )
);