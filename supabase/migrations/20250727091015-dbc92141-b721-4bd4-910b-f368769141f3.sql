-- Fix deliberation update policies with correct function signature
-- Allow admins to update any deliberation

CREATE POLICY "Admins can update any deliberation"
ON public.deliberations
FOR UPDATE
USING (is_admin_user(auth.uid()));