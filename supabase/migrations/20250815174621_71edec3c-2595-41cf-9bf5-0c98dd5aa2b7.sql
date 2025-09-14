-- Drop the problematic policy that might cause infinite recursion
DROP POLICY IF EXISTS "Admins can delete user profiles" ON public.profiles;

-- Create a safer delete policy using the existing is_admin_user function
CREATE POLICY "Admins can delete user profiles" 
ON public.profiles 
FOR DELETE 
USING (is_admin_user(auth.uid()));

-- Test if we can now delete the specific user
-- First let's check what policies exist on profiles table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';