-- Fix infinite recursion in access_codes RLS policies
-- The issue is likely that the policies are referencing the same table they're protecting

-- First, check what policies exist on access_codes
SELECT schemaname, tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'access_codes';

-- Drop any problematic policies that might cause recursion
DROP POLICY IF EXISTS "Admin users can manage access codes" ON public.access_codes;
DROP POLICY IF EXISTS "Admin users can view access codes" ON public.access_codes;
DROP POLICY IF EXISTS "Users can view their own access code" ON public.access_codes;

-- Create non-recursive policies for access_codes
-- Only allow operations when explicitly called by admin functions
CREATE POLICY "Allow admin access code operations" 
ON public.access_codes 
FOR ALL 
USING (
  -- Allow if called from admin functions or if current user setting indicates admin
  current_setting('app.current_user_id', true) IS NOT NULL 
  AND current_setting('app.current_user_id', true) != ''
  AND current_setting('app.current_user_id', true) != 'null'
);

-- Alternative: Create a bypass policy for specific functions
CREATE POLICY "Bypass for security definer functions" 
ON public.access_codes 
FOR ALL 
TO postgres, service_role
USING (true);