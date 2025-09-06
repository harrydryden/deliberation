-- First, let's clean up all existing user data
DELETE FROM auth.users;
DELETE FROM profiles;
DELETE FROM participants;
DELETE FROM messages;
DELETE FROM user_sessions;
DELETE FROM user_activity_logs;
DELETE FROM agent_ratings;
DELETE FROM user_stance_scores;
DELETE FROM facilitator_sessions;

-- Update the handle_new_user function to properly set passwords
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
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
    COALESCE(new.raw_user_meta_data->>'access_code_2', generate_access_code_2()),
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role),
    now()
  );
  
  -- Update the user's password to match access_code_2
  -- This ensures passwords are always in sync from creation
  UPDATE auth.users 
  SET encrypted_password = crypt(
    COALESCE(new.raw_user_meta_data->>'access_code_2', generate_access_code_2()), 
    gen_salt('bf')
  )
  WHERE id = new.id;
  
  RETURN new;
END;
$$;

-- Now let's recreate the main users with known access codes
-- Admin user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  aud,
  role
) VALUES (
  '5f7fe9ee-0aec-425e-bcf8-e21a0a7821e5',
  'ADMIN@deliberation.local',
  crypt('123456', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"access_code_1": "ADMIN", "access_code_2": "123456", "role": "admin"}',
  'authenticated',
  'authenticated'
);

-- User TWCEQ  
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  aud,
  role
) VALUES (
  gen_random_uuid(),
  'TWCEQ@deliberation.local',
  crypt('177411', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"access_code_1": "TWCEQ", "access_code_2": "177411", "role": "user"}',
  'authenticated',
  'authenticated'
);