-- Update all existing users with random access codes and proper email format
WITH user_updates AS (
  SELECT 
    id,
    generate_access_code_1() as new_code_1,
    generate_access_code_2() as new_code_2
  FROM profiles 
  WHERE access_code_1 IS NULL OR access_code_2 IS NULL OR access_code_1 = '' OR access_code_2 = ''
)
UPDATE profiles 
SET 
  access_code_1 = user_updates.new_code_1,
  access_code_2 = user_updates.new_code_2
FROM user_updates
WHERE profiles.id = user_updates.id;

-- Update auth.users emails to use the access code prefix format
UPDATE auth.users 
SET 
  email = profiles.access_code_1 || '@deliberation.local',
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'access_code_1', profiles.access_code_1,
    'access_code_2', profiles.access_code_2
  )
FROM profiles
WHERE auth.users.id = profiles.id 
  AND profiles.access_code_1 IS NOT NULL 
  AND profiles.access_code_2 IS NOT NULL;