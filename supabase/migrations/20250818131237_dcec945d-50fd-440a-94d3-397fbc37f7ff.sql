-- Create a security definer function to check admin status without recursion
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::app_role
  );
$$;

-- Update the is_admin function to use the security definer version
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth_is_admin();
$$;

-- Drop and recreate the problematic policies with better isolation
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;

-- Create new policies that avoid recursion
CREATE POLICY "Service role can manage user_roles"
ON user_roles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view their own roles only"
ON user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- For profiles, create a simple admin policy
CREATE POLICY "Authenticated users can view profiles"
ON profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own profile only"
ON profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);