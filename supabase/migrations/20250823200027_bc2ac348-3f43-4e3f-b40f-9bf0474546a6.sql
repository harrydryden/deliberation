-- Fix RLS policy for admin access to user_roles table
-- Add policy to allow admins to view all user roles

CREATE POLICY "Admins can view all user roles" 
ON public.user_roles 
FOR SELECT 
USING (auth_is_admin());

-- Also ensure admins can manage user roles  
CREATE POLICY "Admins can manage all user roles"
ON public.user_roles
FOR ALL
USING (auth_is_admin())
WITH CHECK (auth_is_admin());