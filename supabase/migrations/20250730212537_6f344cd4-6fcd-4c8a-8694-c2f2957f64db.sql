-- Drop all RLS policies that might be causing recursion
DROP POLICY IF EXISTS "Allow deliberation access" ON public.deliberations;
DROP POLICY IF EXISTS "Allow deliberation creation" ON public.deliberations;
DROP POLICY IF EXISTS "Allow deliberation updates" ON public.deliberations;
DROP POLICY IF EXISTS "Allow deliberation deletion" ON public.deliberations;

DROP POLICY IF EXISTS "Participants can view deliberation members" ON public.participants;
DROP POLICY IF EXISTS "Simple participant management" ON public.participants;
DROP POLICY IF EXISTS "Users can join deliberations" ON public.participants;
DROP POLICY IF EXISTS "Authenticated admins can view all participants" ON public.participants;
DROP POLICY IF EXISTS "Authenticated admins can manage all participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can manage all participants" ON public.participants;

-- Create simple deliberations policies without cross-table references
CREATE POLICY "Public deliberations readable" 
ON public.deliberations 
FOR SELECT 
USING (is_public = true);

CREATE POLICY "Facilitators can read their deliberations" 
ON public.deliberations 
FOR SELECT 
USING (auth.uid() = facilitator_id);

CREATE POLICY "Admins can read all deliberations" 
ON public.deliberations 
FOR SELECT 
USING (is_admin_user(auth.uid()));

CREATE POLICY "Admins can create deliberations" 
ON public.deliberations 
FOR INSERT 
WITH CHECK (is_admin_user(auth.uid()));

CREATE POLICY "Facilitators can update their deliberations" 
ON public.deliberations 
FOR UPDATE 
USING (auth.uid() = facilitator_id OR is_admin_user(auth.uid()));

CREATE POLICY "Admins can delete deliberations" 
ON public.deliberations 
FOR DELETE 
USING (is_admin_user(auth.uid()));

-- Create simple participants policies without referencing deliberations table
CREATE POLICY "Users can view participants where they are participants" 
ON public.participants 
FOR SELECT 
USING (auth.uid() = user_id OR is_admin_user(auth.uid()));

CREATE POLICY "Users can join as participants" 
ON public.participants 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave deliberations" 
ON public.participants 
FOR DELETE 
USING (auth.uid() = user_id OR is_admin_user(auth.uid()));