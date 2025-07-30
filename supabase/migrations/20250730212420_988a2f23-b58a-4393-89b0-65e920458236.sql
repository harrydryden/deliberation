-- Drop all existing RLS policies for deliberations table to fix infinite recursion
DROP POLICY IF EXISTS "Public deliberations are viewable by everyone" ON public.deliberations;
DROP POLICY IF EXISTS "Authenticated admins can view all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Authenticated admins can manage all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Only admins can create deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can manage all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Facilitators can update their deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can update any deliberation" ON public.deliberations;
DROP POLICY IF EXISTS "Simple deliberation access" ON public.deliberations;

-- Create simplified, non-conflicting RLS policies for deliberations
CREATE POLICY "Allow deliberation access" 
ON public.deliberations 
FOR SELECT 
USING (
  is_public = true 
  OR auth.uid() = facilitator_id 
  OR is_admin_user(auth.uid())
  OR EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = deliberations.id 
    AND participants.user_id = auth.uid()
  )
);

CREATE POLICY "Allow deliberation creation" 
ON public.deliberations 
FOR INSERT 
WITH CHECK (is_admin_user(auth.uid()));

CREATE POLICY "Allow deliberation updates" 
ON public.deliberations 
FOR UPDATE 
USING (
  auth.uid() = facilitator_id 
  OR is_admin_user(auth.uid())
);

CREATE POLICY "Allow deliberation deletion" 
ON public.deliberations 
FOR DELETE 
USING (is_admin_user(auth.uid()));