-- Security Hardening Phase 5: Fix the final function search path issue
-- Performance-neutral security improvement

-- Fix the remaining function that needs search_path security
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  -- Automatically set the password to match access_code_2 using extensions schema
  UPDATE auth.users 
  SET encrypted_password = extensions.crypt(access_code_2_value, extensions.gen_salt('bf'))
  WHERE id = new.id;
  
  RETURN new;
END;
$$;