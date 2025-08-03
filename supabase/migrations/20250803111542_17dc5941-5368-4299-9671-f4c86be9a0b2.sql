-- Assign an unused access code to user 5e2ba26e-676a-482f-9b24-9dee2712554c
UPDATE access_codes 
SET 
  is_used = true,
  used_by = '5e2ba26e-676a-482f-9b24-9dee2712554c',
  used_at = '2025-07-27 09:12:33.027765+00'::timestamp with time zone
WHERE code = '5678901234';