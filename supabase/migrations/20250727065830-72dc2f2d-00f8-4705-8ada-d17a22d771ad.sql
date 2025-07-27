-- Update deliberations table RLS policies to restrict creation to admins only
-- First drop existing policies for deliberations creation
DROP POLICY IF EXISTS "Facilitators can manage their deliberations" ON public.deliberations;

-- Create new policy that only allows admins to create deliberations
CREATE POLICY "Only admins can create deliberations" 
ON public.deliberations 
FOR INSERT 
WITH CHECK (is_admin_user(auth.uid()));

-- Allow admins to manage all deliberations  
CREATE POLICY "Admins can manage all deliberations" 
ON public.deliberations 
FOR ALL
USING (is_admin_user(auth.uid()))
WITH CHECK (is_admin_user(auth.uid()));

-- Allow facilitators to update their own deliberations (but not create)
CREATE POLICY "Facilitators can update their deliberations" 
ON public.deliberations 
FOR UPDATE
USING (auth.uid() = facilitator_id);

-- Ensure participants table allows admins to manage participants
CREATE POLICY "Admins can manage all participants" 
ON public.participants 
FOR ALL
USING (is_admin_user(auth.uid()))
WITH CHECK (is_admin_user(auth.uid()));