-- Fix admin user roles
UPDATE user_roles 
SET role = 'admin' 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE raw_user_meta_data->>'role' = 'admin'
);

-- Update the trigger function to handle the role assignment correctly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create profile for the new user
  INSERT INTO public.profiles (id, migrated_from_access_code)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'access_code_1');
  
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