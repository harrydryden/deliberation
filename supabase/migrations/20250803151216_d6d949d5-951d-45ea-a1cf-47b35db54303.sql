-- First, assign an unused access code to the user who doesn't have one
UPDATE access_codes 
SET 
  is_used = true,
  used_by = 'c5961f73-b7de-403a-b8ba-de18b92715f3',
  used_at = now()
WHERE code = '6789012345';

-- Update the profiles table to use code_type as the primary role attribute
-- We'll rename user_role to role for clarity and ensure it matches access code types
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- Migrate existing user_role values to the new role column
UPDATE profiles 
SET role = user_role 
WHERE role IS NULL;

-- Now let's create a function to automatically assign roles based on access codes
CREATE OR REPLACE FUNCTION public.sync_user_role_with_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- When an access code is assigned to a user, update their role
  IF TG_OP = 'UPDATE' AND OLD.used_by IS NULL AND NEW.used_by IS NOT NULL THEN
    UPDATE profiles 
    SET role = NEW.code_type 
    WHERE id = NEW.used_by;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically sync roles when access codes are assigned
DROP TRIGGER IF EXISTS sync_user_role_trigger ON access_codes;
CREATE TRIGGER sync_user_role_trigger
  AFTER UPDATE ON access_codes
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_role_with_access_code();

-- Update the user_profiles_with_codes view to use the new consolidated role
DROP VIEW IF EXISTS user_profiles_with_codes;
CREATE VIEW user_profiles_with_codes AS
SELECT 
  p.id,
  p.display_name,
  p.role as user_role,  -- Use the new role field
  p.expertise_areas,
  p.created_at,
  p.updated_at,
  p.avatar_url,
  p.bio,
  ac.code as access_code,
  ac.code_type,
  ac.used_at
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id;

-- Update RLS policies to use the new role field
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile" 
ON profiles 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM profiles p 
  WHERE p.id = auth.uid() AND p.role = 'admin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles p 
  WHERE p.id = auth.uid() AND p.role = 'admin'
));

DROP POLICY IF EXISTS "Authenticated admins can view all profiles" ON profiles;
CREATE POLICY "Authenticated admins can view all profiles" 
ON profiles 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles p 
  WHERE p.id = auth.uid() AND p.role = 'admin'
));

-- Update the is_admin_user function to use the new role field
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role = 'admin'
  );
$function$;

-- Update the prevent_role_escalation trigger function
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- If role is being changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Only allow if current user is admin
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can change user roles';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;