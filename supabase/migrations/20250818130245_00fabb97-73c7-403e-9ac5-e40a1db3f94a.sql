-- Update the handle_new_user trigger to work with Supabase Auth
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
  
  -- Determine role based on metadata or default to user
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;