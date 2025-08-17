-- Update RLS policies for agent_knowledge table to work with custom auth system
-- Drop existing policy
DROP POLICY IF EXISTS "Admin users can manage all knowledge" ON agent_knowledge;

-- Create new policy that allows access for users with admin access codes
CREATE POLICY "Admin access code users can manage all knowledge" 
ON agent_knowledge 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM access_codes ac
    WHERE ac.code_type = 'admin' 
    AND ac.is_active = true
    AND ac.is_used = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM access_codes ac
    WHERE ac.code_type = 'admin' 
    AND ac.is_active = true
    AND ac.is_used = true
  )
);