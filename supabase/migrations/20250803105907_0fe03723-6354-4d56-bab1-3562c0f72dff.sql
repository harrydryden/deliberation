-- Fix the data consistency issue: link the access code to the user who used it
UPDATE access_codes 
SET 
  is_used = true,
  used_by = '7b0e49ca-0127-4dd0-b8e4-082596a3e425',
  used_at = '2025-08-03 10:39:42.798044+00'::timestamp with time zone
WHERE code = '0987654321';

-- Let's also check for any other similar data inconsistencies by finding users who have access codes in auth metadata but aren't linked in access_codes table
-- First, let's fix any other similar issues we can find

-- Update access code 1234567890 for user 5e2ba26e-676a-482f-9b24-9dee2712554c
UPDATE access_codes 
SET 
  is_used = true,
  used_by = '5e2ba26e-676a-482f-9b24-9dee2712554c',
  used_at = '2025-07-27 09:12:33.027765+00'::timestamp with time zone
WHERE code = '1234567890';

-- Update access code 3456789012 for user 1754a99d-2308-4b9c-ad02-bf943018237d  
UPDATE access_codes 
SET 
  is_used = true,
  used_by = '1754a99d-2308-4b9c-ad02-bf943018237d',
  used_at = '2025-07-31 12:07:01.153414+00'::timestamp with time zone
WHERE code = '3456789012';