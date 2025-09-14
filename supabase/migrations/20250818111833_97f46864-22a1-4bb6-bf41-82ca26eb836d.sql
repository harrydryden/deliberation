-- Simplified fix for admin statistics access
-- Remove conflicting policies and create a single comprehensive admin policy per table

-- Clean up deliberations policies
DROP POLICY IF EXISTS "Admins can view all deliberations for stats" ON public.deliberations;
DROP POLICY IF EXISTS "Users can view accessible deliberations" ON public.deliberations;

CREATE POLICY "Admin and user deliberation access"
ON public.deliberations
FOR SELECT
USING (
  is_authenticated_admin() OR
  is_public = true OR 
  id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);

-- Clean up messages policies  
DROP POLICY IF EXISTS "Admins can view all messages for stats" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON public.messages;

CREATE POLICY "Admin and user message access"
ON public.messages
FOR SELECT
USING (
  is_authenticated_admin() OR
  user_id = get_authenticated_user()::text OR 
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);

-- Clean up profiles policies
DROP POLICY IF EXISTS "Admins can view all profiles for stats" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Admin and user profile access"
ON public.profiles
FOR SELECT
USING (
  is_authenticated_admin() OR
  id = get_authenticated_user()
);

-- Clean up access_codes policies
DROP POLICY IF EXISTS "Admins can view all access codes for stats" ON public.access_codes;
DROP POLICY IF EXISTS "Allow reading access codes for authentication" ON public.access_codes;

CREATE POLICY "Admin and auth access code access"
ON public.access_codes
FOR SELECT
USING (
  is_authenticated_admin() OR
  is_active = true
);