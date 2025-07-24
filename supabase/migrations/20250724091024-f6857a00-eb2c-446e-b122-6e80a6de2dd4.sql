-- Remove all policies and temporarily disable RLS to fix the recursion issue
ALTER TABLE agent_configurations DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Facilitators can manage agent configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Users can view default configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Admin users can manage all agent configurations" ON agent_configurations;

-- Re-enable RLS with a simple policy structure
ALTER TABLE agent_configurations ENABLE ROW LEVEL SECURITY;

-- Create one simple policy for all operations for default configurations
CREATE POLICY "Allow access to default configurations" 
ON agent_configurations 
FOR ALL 
USING (is_default = true);