-- Add RLS policies to allow users to view deliberations they can access

-- Allow users to view public deliberations
CREATE POLICY "Users can view public deliberations" 
ON public.deliberations 
FOR SELECT 
TO public
USING (is_public = true);

-- Allow users to view deliberations they participate in
CREATE POLICY "Users can view deliberations they participate in" 
ON public.deliberations 
FOR SELECT 
TO public
USING (
  EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = deliberations.id 
    AND participants.user_id = get_current_access_code_user()
  )
);

-- Allow admins to view all deliberations
CREATE POLICY "Admins can view all deliberations" 
ON public.deliberations 
FOR SELECT 
TO public
USING (is_admin_access_code_user());