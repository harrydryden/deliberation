-- Temporarily allow broader access to test the admin functionality
-- We'll create more permissive policies for the underlying tables

-- Allow anon and authenticated users to view profiles (temporarily)
CREATE POLICY "Temporary admin access to profiles" 
ON public.profiles 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow anon and authenticated users to view access codes (temporarily for admin testing)
CREATE POLICY "Temporary admin access to access codes" 
ON public.access_codes 
FOR SELECT 
TO anon, authenticated 
USING (true);