-- Enable RLS on facilitator_sessions
ALTER TABLE public.facilitator_sessions ENABLE ROW LEVEL SECURITY;

-- Users can create their own facilitator sessions
CREATE POLICY "Users can create their own facilitator sessions"
ON public.facilitator_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own facilitator sessions
CREATE POLICY "Users can view their own facilitator sessions"
ON public.facilitator_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own facilitator sessions
CREATE POLICY "Users can update their own facilitator sessions"
ON public.facilitator_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can manage all facilitator sessions
CREATE POLICY "Admins can manage all facilitator sessions"
ON public.facilitator_sessions
FOR ALL
TO authenticated
USING (auth_is_admin())
WITH CHECK (auth_is_admin());

-- Add admin-only update/delete policies for IBIS nodes
CREATE POLICY "Admins can update IBIS nodes"
ON public.ibis_nodes
FOR UPDATE
TO authenticated
USING (auth_is_admin())
WITH CHECK (auth_is_admin());

CREATE POLICY "Admins can delete IBIS nodes"
ON public.ibis_nodes
FOR DELETE
TO authenticated
USING (auth_is_admin());

-- Add admin-only update/delete policies for agent configurations
CREATE POLICY "Admins can update agent configurations"
ON public.agent_configurations
FOR UPDATE
TO authenticated
USING (auth_is_admin())
WITH CHECK (auth_is_admin());

CREATE POLICY "Admins can delete agent configurations"
ON public.agent_configurations
FOR DELETE
TO authenticated
USING (auth_is_admin());