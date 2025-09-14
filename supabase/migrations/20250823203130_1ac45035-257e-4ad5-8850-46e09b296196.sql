-- Fix agent_knowledge RLS policies to allow edge functions to work properly
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage all agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Service role can manage agent knowledge" ON public.agent_knowledge;

-- Create clear, simple policies
-- 1. Service role (edge functions) can do everything
CREATE POLICY "Service role full access" 
ON public.agent_knowledge 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. Admins can manage all knowledge
CREATE POLICY "Admins can manage all agent knowledge" 
ON public.agent_knowledge 
FOR ALL 
USING (auth_is_admin())
WITH CHECK (auth_is_admin());

-- 3. Users can only see knowledge for agents in deliberations they participate in
CREATE POLICY "Users can view relevant agent knowledge" 
ON public.agent_knowledge 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM agent_configurations ac
    JOIN participants p ON p.deliberation_id = ac.deliberation_id
    WHERE ac.id = agent_knowledge.agent_id 
    AND p.user_id = auth.uid()::text
  )
);