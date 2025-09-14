-- Update the handle_new_user function to copy access codes from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Create profile for the new user with access codes from metadata
  INSERT INTO public.profiles (
    id, 
    migrated_from_access_code,
    access_code_1,
    access_code_2
  )
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'access_code_1',
    NEW.raw_user_meta_data->>'access_code_1',
    NEW.raw_user_meta_data->>'access_code_2'
  );
  
  -- Check for admin role in metadata and assign appropriately
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update existing users' profiles with their access codes from auth metadata
UPDATE public.profiles 
SET 
  access_code_1 = auth_users.raw_user_meta_data->>'access_code_1',
  access_code_2 = auth_users.raw_user_meta_data->>'access_code_2'
FROM auth.users auth_users
WHERE profiles.id = auth_users.id
  AND auth_users.raw_user_meta_data IS NOT NULL
  AND (
    auth_users.raw_user_meta_data->>'access_code_1' IS NOT NULL 
    OR auth_users.raw_user_meta_data->>'access_code_2' IS NOT NULL
  );