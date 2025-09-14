-- Drop the incorrect admin policies
DROP POLICY IF EXISTS "Admins can view all IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Admins can update all IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Admins can delete IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Admins can create IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Admins can view all IBIS relationships" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Admins can update IBIS relationships" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Admins can delete IBIS relationships" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Admins can create IBIS relationships" ON public.ibis_relationships;

-- Add corrected admin access policies for IBIS nodes with proper function call
CREATE POLICY "Admins can view all IBIS nodes"
ON public.ibis_nodes
FOR SELECT
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can update all IBIS nodes" 
ON public.ibis_nodes
FOR UPDATE
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can delete IBIS nodes"
ON public.ibis_nodes 
FOR DELETE
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can create IBIS nodes"
ON public.ibis_nodes
FOR INSERT
WITH CHECK (is_admin_user(auth.uid()));

-- Add corrected admin access policies for IBIS relationships with proper function call
CREATE POLICY "Admins can view all IBIS relationships"
ON public.ibis_relationships
FOR SELECT
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can update IBIS relationships"
ON public.ibis_relationships
FOR UPDATE  
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can delete IBIS relationships"
ON public.ibis_relationships
FOR DELETE
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can create IBIS relationships" 
ON public.ibis_relationships
FOR INSERT
WITH CHECK (is_admin_user(auth.uid()));