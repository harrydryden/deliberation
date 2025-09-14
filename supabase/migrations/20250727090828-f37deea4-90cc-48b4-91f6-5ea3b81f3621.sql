-- Fix deliberation update policies
-- Allow admins to update any deliberation
-- Also allow facilitators to update their own deliberations

-- First check current policies
-- We need to add/fix the policy for updating deliberations

-- Allow admins to update any deliberation
CREATE POLICY "Admins can update any deliberation"
ON public.deliberations
FOR UPDATE
USING (is_admin_user(auth.uid()::text));

-- Also ensure facilitators can update their own deliberations (this might already exist)
CREATE POLICY "Facilitators can update their own deliberations"
ON public.deliberations
FOR UPDATE
USING (auth.uid() = facilitator_id);