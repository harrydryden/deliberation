-- Fix critical security flaw: Remove policy that allows all authenticated users to view all profiles
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create secure admin-only policy for viewing all profiles (needed for admin dashboard)
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (auth_is_admin());

-- Verify existing secure policies remain intact:
-- "Users can view their own profile" - allows users to see their own profile
-- "Users can update their own profile" - allows users to update their own profile  
-- "Users can insert their own profile" - allows users to create their own profile
-- "Service role can manage profiles" - allows service role full access