-- Fix the handle_new_user trigger function to remove reference to non-existent column
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile for the new user with access codes from metadata
  INSERT INTO public.profiles (
    id, 
    access_code_1,
    access_code_2
  )
  VALUES (
    NEW.id, 
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
$function$;