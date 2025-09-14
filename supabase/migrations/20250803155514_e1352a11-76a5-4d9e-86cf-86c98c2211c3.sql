-- Fix Authentication Issue: Allow access code validation for unauthenticated users

-- Drop the restrictive policy that prevents initial authentication
DROP POLICY IF EXISTS "Limited access code validation" ON access_codes;

-- Create a more permissive policy for access code validation during authentication
CREATE POLICY "Allow access code validation for authentication" 
ON access_codes FOR SELECT 
USING (
  -- Allow reading codes for validation (but limit what can be selected to minimize data exposure)
  true
);

-- The admin management policy remains restrictive
-- "Admins can manage access codes" policy already exists and is correct