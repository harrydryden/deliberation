-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow access to default configurations" ON public.agent_configurations;

-- Create comprehensive policies for agent configurations
-- Allow reading default (global) agent configurations by everyone
CREATE POLICY "Anyone can read default agent configurations" 
ON public.agent_configurations 
FOR SELECT 
USING (is_default = true);

-- Allow admins to read all agent configurations
CREATE POLICY "Admins can read all agent configurations" 
ON public.agent_configurations 
FOR SELECT 
USING (is_admin_user(auth.uid()));

-- Allow admins to create agent configurations (both global and local)
CREATE POLICY "Admins can create agent configurations" 
ON public.agent_configurations 
FOR INSERT 
WITH CHECK (is_admin_user(auth.uid()));

-- Allow admins to update agent configurations
CREATE POLICY "Admins can update agent configurations" 
ON public.agent_configurations 
FOR UPDATE 
USING (is_admin_user(auth.uid()))
WITH CHECK (is_admin_user(auth.uid()));

-- Allow admins to delete agent configurations
CREATE POLICY "Admins can delete agent configurations" 
ON public.agent_configurations 
FOR DELETE 
USING (is_admin_user(auth.uid()));