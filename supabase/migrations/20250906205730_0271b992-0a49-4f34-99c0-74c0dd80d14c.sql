-- Enable pgcrypto extension first
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Simplified handle_new_user function that only handles profile creation
-- Password management should be done through Supabase auth, not directly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only create the profile - let Supabase handle password management
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
    COALESCE(new.raw_user_meta_data->>'access_code_2', generate_access_code_2()),
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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
  'TEST3@deliberation.local',
  now(),
  now(),
  now(),
  '{"access_code_1": "TESTC", "access_code_2": "888888", "role": "user"}',
  'authenticated',
  'authenticated'
);

-- Verify the profile was created
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'access_code_2' as metadata_password,
  p.access_code_1,
  p.access_code_2,
  p.user_role,
  'Profile created - password should be synced via PasswordSyncButton' as note
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'TEST3@deliberation.local';