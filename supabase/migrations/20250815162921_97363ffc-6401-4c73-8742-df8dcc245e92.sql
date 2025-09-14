-- Add temporary policies for agent_configurations to allow admin access during testing
-- This will allow the Local Agent Management to work with mock authentication

-- Allow anon and authenticated users to view agent configurations (temporarily for admin testing)
CREATE POLICY "Temporary admin access to agent configurations" 
ON public.agent_configurations 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow anon and authenticated users to insert agent configurations (temporarily)
CREATE POLICY "Temporary admin insert agent configurations" 
ON public.agent_configurations 
FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

-- Allow anon and authenticated users to update agent configurations (temporarily)
CREATE POLICY "Temporary admin update agent configurations" 
ON public.agent_configurations 
FOR UPDATE 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

-- Allow anon and authenticated users to delete agent configurations (temporarily)
CREATE POLICY "Temporary admin delete agent configurations" 
ON public.agent_configurations 
FOR DELETE 
TO anon, authenticated 
USING (true);