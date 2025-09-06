-- Clean up the test user
DELETE FROM auth.users WHERE email = 'TESTF@deliberation.local';
DELETE FROM profiles WHERE access_code_1 = 'TESTF';

-- Test that we can login with a newly created user
-- Create a final test user
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
  'NEWUSER@deliberation.local',
  now(),
  now(),
  now(),
  '{"access_code_1": "NEWUS", "access_code_2": "999999", "role": "user"}',
  'authenticated',
  'authenticated'
);

-- Confirm the user can be created and has proper login credentials
SELECT 
  u.email,
  p.access_code_1 || ' / ' || p.access_code_2 as login_credentials,
  p.user_role,
  'Ready to login!' as status
FROM auth.users u
JOIN profiles p ON u.id = p.id
WHERE u.email = 'NEWUSER@deliberation.local';