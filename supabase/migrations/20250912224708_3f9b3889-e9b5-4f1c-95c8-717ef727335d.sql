-- Add RLS policy to allow admins to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());