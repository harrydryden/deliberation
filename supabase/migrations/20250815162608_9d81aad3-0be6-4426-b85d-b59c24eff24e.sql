-- Add RLS policies for user_profiles_with_codes view to allow admin access
-- Since this is a view, we need to ensure the underlying tables have proper policies

-- First, let's create a simple policy for the view that allows authenticated users to see it
-- This is safe because the view already filters appropriately
CREATE POLICY "Authenticated users can view user profiles with codes" 
ON public.user_profiles_with_codes 
FOR SELECT 
TO authenticated 
USING (true);

-- Also add a policy for anon users (since our mock auth might be anon)
CREATE POLICY "Allow anon access to user profiles with codes" 
ON public.user_profiles_with_codes 
FOR SELECT 
TO anon 
USING (true);