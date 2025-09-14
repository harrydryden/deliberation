-- Ensure proper segmentation for deliberations and related data

-- Fix deliberations access - users should only see deliberations they participate in
DROP POLICY IF EXISTS "Public deliberations are readable" ON public.deliberations;
DROP POLICY IF EXISTS "Public deliberations readable" ON public.deliberations;

CREATE POLICY "Users can view deliberations they participate in"
ON public.deliberations
FOR SELECT
USING (
  -- Public deliberations are visible to everyone
  is_public = true
  OR
  -- Users can see deliberations they're facilitating
  facilitator_id = get_current_access_code_user()
  OR
  -- Users can see deliberations they participate in
  EXISTS (
    SELECT 1 FROM participants p
    WHERE p.deliberation_id = deliberations.id
    AND p.user_id = get_current_access_code_user()
  )
  OR
  -- Admins can see all deliberations
  is_admin_access_code_user()
);

-- Fix IBIS nodes access - users should only see nodes from deliberations they participate in
DROP POLICY IF EXISTS "Authenticated can view IBIS nodes" ON public.ibis_nodes;
CREATE POLICY "Users can view IBIS nodes in their deliberations"
ON public.ibis_nodes
FOR SELECT
USING (
  -- Users can see IBIS nodes in deliberations they participate in
  EXISTS (
    SELECT 1 FROM participants p
    WHERE p.deliberation_id = ibis_nodes.deliberation_id
    AND p.user_id = get_current_access_code_user()
  )
  OR
  -- Admins can see all IBIS nodes
  is_admin_access_code_user()
);

-- Fix IBIS relationships access
DROP POLICY IF EXISTS "Authenticated can view IBIS relationships" ON public.ibis_relationships;
CREATE POLICY "Users can view IBIS relationships in their deliberations"
ON public.ibis_relationships
FOR SELECT
USING (
  -- Users can see IBIS relationships in deliberations they participate in
  EXISTS (
    SELECT 1 FROM participants p
    WHERE p.deliberation_id = ibis_relationships.deliberation_id
    AND p.user_id = get_current_access_code_user()
  )
  OR
  -- Admins can see all IBIS relationships
  is_admin_access_code_user()
);

-- Fix agent interactions access
DROP POLICY IF EXISTS "Participants can view agent interactions" ON public.agent_interactions;
CREATE POLICY "Users can view agent interactions in their deliberations"
ON public.agent_interactions
FOR SELECT
USING (
  -- Users can see agent interactions in deliberations they participate in
  EXISTS (
    SELECT 1 FROM participants p
    WHERE p.deliberation_id = agent_interactions.deliberation_id
    AND p.user_id = get_current_access_code_user()
  )
  OR
  -- Admins can see all agent interactions
  is_admin_access_code_user()
);