-- Add temporary policies for deliberations to allow admin access during testing
-- This will allow the Local Agent Management to load deliberations data

-- Allow anon and authenticated users to view deliberations (temporarily for admin testing)
CREATE POLICY "Temporary admin access to deliberations" 
ON public.deliberations 
FOR SELECT 
TO anon, authenticated 
USING (true);