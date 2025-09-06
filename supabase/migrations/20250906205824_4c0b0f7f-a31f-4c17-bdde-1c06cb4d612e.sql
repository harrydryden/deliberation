-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Clean up previous test users
DELETE FROM auth.users WHERE email LIKE 'TEST%@deliberation.local';
DELETE FROM profiles WHERE access_code_1 LIKE 'TEST%';

-- Test the trigger works by creating a test user
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
  'TESTD@deliberation.local',
  now(),
  now(),
  now(),
  '{"access_code_1": "TESTD", "access_code_2": "999999", "role": "user"}',
  'authenticated',
  'authenticated'
);

-- Verify the profile was created automatically by the trigger
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'access_code_1' as meta_code1,
  u.raw_user_meta_data->>'access_code_2' as meta_code2,
  p.access_code_1,
  p.access_code_2,
  p.user_role,
  CASE WHEN p.id IS NOT NULL THEN 'Profile Created by Trigger ✓' ELSE 'Profile Missing ✗' END as trigger_status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'TESTD@deliberation.local';