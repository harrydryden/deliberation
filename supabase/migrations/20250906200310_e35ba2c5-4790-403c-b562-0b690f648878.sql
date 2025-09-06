-- Consolidate user_roles into profiles table while preserving access codes and proper role enum
-- Step 1: Add app_role column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_role app_role DEFAULT 'user'::app_role;

-- Step 2: Migrate role data from user_roles to profiles
UPDATE public.profiles 
SET user_role = ur.role
FROM public.user_roles ur
WHERE profiles.id = ur.user_id;

-- Step 3: Update handle_new_user trigger function to use profiles only
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, access_code_1, access_code_2, user_role)
  values (
    new.id, 
    new.raw_user_meta_data->>'access_code_1',
    new.raw_user_meta_data->>'access_code_2',
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role)
  );
  return new;
end;
$$;

-- Step 4: Update auth_is_admin function to use profiles table
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND user_role = 'admin'::app_role
  );
$$;

-- Step 5: Update has_role function to use profiles table
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND user_role = _role
  );
$$;

-- Step 6: Update is_admin_user function to use profiles table
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND user_role = 'admin'::app_role
  );
$$;

-- Step 7: Update create_user_with_access_code function
CREATE OR REPLACE FUNCTION public.create_user_with_access_code(p_user_role text DEFAULT 'user'::text)
RETURNS TABLE(user_id uuid, access_code text, profile_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_user_id uuid;
  new_access_code text;
  existing_unused_code record;
BEGIN
  -- Generate a new user ID
  new_user_id := gen_random_uuid();
  
  -- Try to find an unused access code of the right type
  SELECT * INTO existing_unused_code
  FROM access_codes 
  WHERE code_type = p_user_role 
    AND is_active = true 
    AND is_used = false
    AND used_by IS NULL
  LIMIT 1;
  
  IF existing_unused_code.id IS NOT NULL THEN
    -- Use existing unused code
    new_access_code := existing_unused_code.code;
    
    -- Update the access code to mark it as used
    UPDATE access_codes 
    SET 
      is_used = true,
      used_by = new_user_id,
      used_at = now(),
      current_uses = current_uses + 1
    WHERE id = existing_unused_code.id;
  ELSE
    -- Create a new access code using simple generator
    new_access_code := generate_simple_access_code();
    
    INSERT INTO access_codes (
      code,
      code_type,
      is_active,
      is_used,
      used_by,
      used_at,
      current_uses
    ) VALUES (
      new_access_code,
      p_user_role,
      true,
      true,
      new_user_id,
      now(),
      1
    );
  END IF;
  
  -- Create the profile with the role
  INSERT INTO profiles (
    id,
    is_archived,
    migrated_from_access_code,
    user_role
  ) VALUES (
    new_user_id,
    false,
    new_access_code,
    p_user_role::app_role
  );
  
  -- Return the results
  RETURN QUERY
  SELECT 
    new_user_id,
    new_access_code,
    true;
END;
$$;

-- Step 8: Remove old role column constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_role_values;

-- Step 9: Update can_user_change_role function
CREATE OR REPLACE FUNCTION public.can_user_change_role(target_user_id uuid, new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only admins can change roles
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = get_current_access_code_user() AND user_role = 'admin'::app_role
  );
END;
$$;

-- Step 10: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_role ON public.profiles(user_role);

-- Step 11: Update RLS policies that might reference user_roles
DROP POLICY IF EXISTS "Admins can manage all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Service role can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Step 12: Drop user_roles table
DROP TABLE IF EXISTS public.user_roles CASCADE;