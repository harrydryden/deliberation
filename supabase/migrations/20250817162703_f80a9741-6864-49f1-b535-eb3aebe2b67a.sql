-- Re-enable RLS on agent_configurations and create proper admin policies
ALTER TABLE agent_configurations ENABLE ROW LEVEL SECURITY;

-- Remove the overly permissive policies that were added as workarounds
DROP POLICY IF EXISTS "Allow authenticated users to delete agent configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Allow authenticated users to insert agent configurations" ON agent_configurations; 
DROP POLICY IF EXISTS "Allow authenticated users to update agent configurations" ON agent_configurations;

-- Keep the essential policies for normal users
-- (The admin policies and default/participant policies should remain)