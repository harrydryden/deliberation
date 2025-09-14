-- Fix the access code linkage for user 6fcee9fb-25e6-473b-8166-e7b35ab42387
-- The access code 1234567890 should be linked to this user, not to 5e2ba26e-676a-482f-9b24-9dee2712554c

-- First, let's see if user 5e2ba26e-676a-482f-9b24-9dee2712554c has their own access code that should be linked properly
-- But for now, let's fix the immediate issue

UPDATE access_codes 
SET used_by = '6fcee9fb-25e6-473b-8166-e7b35ab42387',
    used_at = '2025-07-23 21:38:17.295367+00'::timestamp with time zone
WHERE code = '1234567890';