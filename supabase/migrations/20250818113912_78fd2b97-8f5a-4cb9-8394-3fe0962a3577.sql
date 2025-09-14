-- Step 2: Update all RLS policies to use auth.uid() and proper role checks

-- Update profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Update user_roles policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Update deliberations policies
DROP POLICY IF EXISTS "Admin and user deliberation access" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can manage all deliberations" ON public.deliberations;

CREATE POLICY "Users can view public deliberations and their own"
ON public.deliberations FOR SELECT
TO authenticated
USING (
  is_public = true OR 
  public.is_admin() OR 
  id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Admins can manage all deliberations"
ON public.deliberations FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());