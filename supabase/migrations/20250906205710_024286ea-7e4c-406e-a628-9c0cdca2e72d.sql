-- First, let's check if the trigger exists and recreate it properly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create the improved handle_new_user function with proper password setting
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  access_code_2_value text;
BEGIN
  -- Get the access_code_2 from metadata
  access_code_2_value := COALESCE(new.raw_user_meta_data->>'access_code_2', generate_access_code_2());
  
  -- Create the profile
  INSERT INTO public.profiles (
    id, 
    access_code_1, 
    access_code_2, 
    user_role,
    created_at
  )
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'access_code_1', generate_access_code_1()),
    access_code_2_value,
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Set the password to match access_code_2 using pgcrypto
  UPDATE auth.users 
  SET encrypted_password = crypt(access_code_2_value, gen_salt('bf'))
  WHERE id = new.id;
  
  RETURN new;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Clean up the test user and recreate to test the trigger
DELETE FROM auth.users WHERE email = 'TEST@deliberation.local';
DELETE FROM profiles WHERE access_code_1 = 'TESTA';

-- Test the trigger by creating another test user
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
  'TEST2@deliberation.local',
  now(),
  now(),
  now(),
  '{"access_code_1": "TESTB", "access_code_2": "777777", "role": "user"}',
  'authenticated',
  'authenticated'
);

-- Verify the trigger worked
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'access_code_2' as expected_password,
  p.access_code_1,
  p.access_code_2,
  p.user_role,
  CASE WHEN u.encrypted_password IS NOT NULL THEN 'Password Set' ELSE 'No Password' END as password_status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'TEST2@deliberation.local';