-- Create admin users with access code format
-- Using the admin.create_user function to create users with specific credentials

-- Admin user 1: ADMIN / 12345
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'ADMIN@deliberation.local',
  crypt('12345', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"access_code_1": "ADMIN", "access_code_2": "12345", "role": "admin"}'::jsonb,
  false
);

-- Admin user 2: SUPER / 54321
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_user_meta_data,
  is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'SUPER@deliberation.local',
  crypt('54321', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"access_code_1": "SUPER", "access_code_2": "54321", "role": "admin"}'::jsonb,
  false
);

-- Create user roles for the admin users
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE u.email IN ('ADMIN@deliberation.local', 'SUPER@deliberation.local');