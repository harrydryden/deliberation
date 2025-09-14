-- Fix infinite recursion in access_codes policies
-- Drop the problematic policy that references the same table
DROP POLICY IF EXISTS "Only admins can manage access codes" ON public.access_codes;
DROP POLICY IF EXISTS "Allow admin access code operations" ON public.access_codes;
DROP POLICY IF EXISTS "Bypass for security definer functions" ON public.access_codes;

-- Create a simple policy that allows operations when user context is set
-- This avoids querying the access_codes table from within its own policy
CREATE POLICY "Allow access code operations with valid context" 
ON public.access_codes 
FOR ALL 
USING (
  -- Allow if there's a valid user context set
  current_setting('app.current_user_id', true) IS NOT NULL 
  AND current_setting('app.current_user_id', true) != ''
  AND current_setting('app.current_user_id', true) != 'null'
);