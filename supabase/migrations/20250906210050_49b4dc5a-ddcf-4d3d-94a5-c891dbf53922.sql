-- Update the handle_new_user function to automatically set passwords
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  access_code_2_value text;
BEGIN
  -- Get the access_code_2 from metadata or generate one
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
  
  -- Automatically set the password to match access_code_2
  UPDATE auth.users 
  SET encrypted_password = crypt(access_code_2_value, gen_salt('bf'))
  WHERE id = new.id;
  
  RETURN new;
END;
$$;

-- Test the automatic password setting with a new user
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
  'TESTE@deliberation.local',
  now(),
  now(),
  now(),
  '{"access_code_1": "TESTE", "access_code_2": "111111", "role": "user"}',
  'authenticated',
  'authenticated'
);

-- Verify both profile creation and password setting worked
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'access_code_2' as expected_password,
  p.access_code_1,
  p.access_code_2,
  p.user_role,
  CASE 
    WHEN u.encrypted_password IS NOT NULL THEN 'Password Auto-Set ✓' 
    ELSE 'Password Missing ✗' 
  END as password_status
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'TESTE@deliberation.local';