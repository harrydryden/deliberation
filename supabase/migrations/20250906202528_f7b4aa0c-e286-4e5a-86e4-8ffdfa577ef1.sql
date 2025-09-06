-- Update specific admin user with access codes and proper email format
UPDATE profiles 
SET 
  access_code_1 = 'ADMIN',
  access_code_2 = '123456'
WHERE id = '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';

-- Update the auth.users table email for this user to follow the pattern
UPDATE auth.users 
SET 
  email = 'ADMIN@deliberation.local',
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'access_code_1', 'ADMIN',
    'access_code_2', '123456'
  )
WHERE id = '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5';