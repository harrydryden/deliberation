-- Fix RLS policy for access_codes to allow authentication queries
-- Add a policy that allows reading access codes for authentication purposes

CREATE POLICY "Allow reading access codes for authentication" 
ON access_codes 
FOR SELECT 
USING (is_active = true);

-- This allows unauthenticated users to read active access codes 
-- which is necessary for the authentication process