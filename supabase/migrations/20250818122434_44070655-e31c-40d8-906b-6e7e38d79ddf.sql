-- Delete the incorrectly created users and recreate them properly
DELETE FROM auth.users WHERE email IN ('ADMIN@deliberation.local', 'SUPER@deliberation.local');

-- Create a function to properly create access code users
CREATE OR REPLACE FUNCTION create_access_code_user(
  p_access_code_1 text,
  p_access_code_2 text,
  p_role text DEFAULT 'user'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_user_id uuid;
  user_email text;
BEGIN
  -- Generate email from access code 1
  user_email := upper(p_access_code_1) || '@deliberation.local';
  
  -- Create the user with proper Supabase auth setup
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    user_email,
    crypt(p_access_code_2, gen_salt('bf')),
    now(),
    null,
    null,
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'access_code_1', upper(p_access_code_1),
      'access_code_2', p_access_code_2,
      'role', p_role
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  ) RETURNING id INTO new_user_id;
  
  -- Add to user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, p_role::app_role);
  
  RETURN new_user_id;
END;
$$;

-- Create the admin users using the function
SELECT create_access_code_user('ADMIN', '12345', 'admin');
SELECT create_access_code_user('SUPER', '54321', 'admin');