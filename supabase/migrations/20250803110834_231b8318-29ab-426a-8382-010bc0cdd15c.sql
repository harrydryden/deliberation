-- Fix user roles to match their access code types
-- Users with admin access codes should have admin role

UPDATE profiles 
SET user_role = 'admin'
WHERE id IN (
  SELECT DISTINCT ac.used_by 
  FROM access_codes ac 
  WHERE ac.code_type = 'admin' 
  AND ac.is_used = true 
  AND ac.used_by IS NOT NULL
);

-- Ensure users with only user access codes have user role (this should already be correct but let's be explicit)
UPDATE profiles 
SET user_role = 'user'
WHERE id IN (
  SELECT DISTINCT ac.used_by 
  FROM access_codes ac 
  WHERE ac.code_type = 'user' 
  AND ac.is_used = true 
  AND ac.used_by IS NOT NULL
  AND ac.used_by NOT IN (
    SELECT DISTINCT used_by 
    FROM access_codes 
    WHERE code_type = 'admin' 
    AND is_used = true 
    AND used_by IS NOT NULL
  )
);