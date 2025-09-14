-- Test creating a new user to verify the function works correctly
-- First, let's create a test user through Supabase auth system
INSERT INTO auth.users (
  id,
  email,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  aud,
  role
) VALUES (
  gen_random_uuid(),
  'TEST@deliberation.local',
  now(),
  now(),
  now(),
  '{"access_code_1": "TESTA", "access_code_2": "555555", "role": "user"}',
  'authenticated',
  'authenticated'
);

-- Check if the profile was created and password was set correctly
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'access_code_1' as code1,
  u.raw_user_meta_data->>'access_code_2' as code2,
  p.access_code_1,
  p.access_code_2,
  p.user_role,
  -- Check if password hash exists
  CASE WHEN u.encrypted_password IS NOT NULL THEN 'Password Set' ELSE 'No Password' END as password_status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'TEST@deliberation.local';