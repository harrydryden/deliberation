-- Fix the access code assignment and user role for the current user
UPDATE access_codes 
SET used_by = 'd25d63bc-663e-4c83-a4c1-e903f78ae84e', 
    used_at = now()
WHERE code = '0000000004';

-- Update the user's role in both tables
UPDATE profiles 
SET role = 'admin', user_role = 'admin' 
WHERE id = 'd25d63bc-663e-4c83-a4c1-e903f78ae84e';

UPDATE user_cache 
SET user_role = 'admin' 
WHERE id = 'd25d63bc-663e-4c83-a4c1-e903f78ae84e';