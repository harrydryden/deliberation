-- Fix the access codes policy to allow reading used codes for authentication
DROP POLICY IF EXISTS "Anyone can read unused access codes for validation" ON access_codes;

CREATE POLICY "Anyone can read access codes for authentication" 
ON access_codes 
FOR SELECT 
USING (true);