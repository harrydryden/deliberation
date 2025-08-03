-- Update user_cache to set admin role for users who used admin access codes
UPDATE user_cache 
SET user_role = 'admin' 
WHERE id IN (
    SELECT used_by 
    FROM access_codes 
    WHERE code_type = 'admin' AND used_by IS NOT NULL
);