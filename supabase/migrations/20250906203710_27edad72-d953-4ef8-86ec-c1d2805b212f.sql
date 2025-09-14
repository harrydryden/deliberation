-- Clean up any fake emails that might exist in auth.users table
-- Update any users that have fake @example.com emails to use proper @deliberation.local format
UPDATE auth.users 
SET email = profiles.access_code_1 || '@deliberation.local'
FROM profiles
WHERE auth.users.id = profiles.id 
  AND profiles.access_code_1 IS NOT NULL 
  AND (auth.users.email LIKE '%@example.com' OR auth.users.email NOT LIKE '%@deliberation.local');