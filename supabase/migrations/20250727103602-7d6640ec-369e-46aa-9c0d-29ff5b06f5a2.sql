-- Fix agent_knowledge RLS policy to use the consistent admin check function
-- This aligns with other admin policies in the system

DROP POLICY IF EXISTS "Admin users can manage all knowledge" ON public.agent_knowledge;

CREATE POLICY "Admin users can manage all knowledge"
ON public.agent_knowledge
FOR ALL
USING (is_admin_user(auth.uid()))
WITH CHECK (is_admin_user(auth.uid()));