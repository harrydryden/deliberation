-- Fix admin access for statistics queries
-- The issue is that admins can't read count data from all tables due to RLS policies

-- Add admin access for deliberations
DROP POLICY IF EXISTS "Users can view accessible deliberations" ON public.deliberations;

CREATE POLICY "Users can view accessible deliberations"
ON public.deliberations
FOR SELECT
USING (
  is_public = true OR 
  is_authenticated_admin() OR
  id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);

-- Add explicit admin read access for deliberations
CREATE POLICY "Admins can view all deliberations for stats"
ON public.deliberations
FOR SELECT
USING (is_authenticated_admin());

-- Add admin access for messages
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON public.messages;

CREATE POLICY "Users can view messages in their deliberations"
ON public.messages
FOR SELECT
USING (
  user_id = get_authenticated_user()::text OR 
  is_authenticated_admin() OR
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);

-- Add explicit admin read access for messages
CREATE POLICY "Admins can view all messages for stats"
ON public.messages
FOR SELECT
USING (is_authenticated_admin());

-- Add admin access for profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (id = get_authenticated_user() OR is_authenticated_admin());

-- Add explicit admin read access for profiles
CREATE POLICY "Admins can view all profiles for stats"
ON public.profiles
FOR SELECT
USING (is_authenticated_admin());

-- Add admin access for access_codes 
DROP POLICY IF EXISTS "Allow reading access codes for authentication" ON public.access_codes;

CREATE POLICY "Allow reading access codes for authentication"
ON public.access_codes
FOR SELECT
USING (is_active = true OR is_authenticated_admin());

-- Add explicit admin read access for access codes
CREATE POLICY "Admins can view all access codes for stats"
ON public.access_codes
FOR SELECT
USING (is_authenticated_admin());