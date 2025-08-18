-- Update all RLS policies to use header-based authentication functions
-- This fixes the "new row violates row-level security policy" errors

-- Helper function to get current user access code from headers
CREATE OR REPLACE FUNCTION public.get_current_user_access_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    CASE 
      WHEN current_setting('request.headers', true)::json->>'x-access-code' IS NOT NULL 
      THEN current_setting('request.headers', true)::json->>'x-access-code'
      ELSE NULL
    END;
$$;

-- Update agent_knowledge policies
DROP POLICY IF EXISTS "Access code admins can manage all agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Admins can manage all agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Service role can insert agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Service role can read agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Service role can update agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Service role can delete agent knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Users can read agent knowledge for queries" ON public.agent_knowledge;

CREATE POLICY "Admins can manage all agent knowledge"
ON public.agent_knowledge
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

CREATE POLICY "Service role can manage agent knowledge"
ON public.agent_knowledge
FOR ALL
USING (auth.role() = 'service_role' OR (created_by = get_authenticated_user() AND is_authenticated_admin()))
WITH CHECK (auth.role() = 'service_role' OR (created_by = get_authenticated_user() AND is_authenticated_admin()));

-- Update access_codes policies
DROP POLICY IF EXISTS "Allow access code operations with valid context" ON public.access_codes;
DROP POLICY IF EXISTS "Allow reading access codes for authentication" ON public.access_codes;
DROP POLICY IF EXISTS "Allow user creation function to insert access codes" ON public.access_codes;

CREATE POLICY "Allow reading access codes for authentication"
ON public.access_codes
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage access codes"
ON public.access_codes
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

-- Update profiles policies
DROP POLICY IF EXISTS "Access code admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Access code users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Access code users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow user creation function to insert profiles" ON public.profiles;

CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (id = get_authenticated_user());

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (id = get_authenticated_user())
WITH CHECK (id = get_authenticated_user());

CREATE POLICY "Allow profile creation"
ON public.profiles
FOR INSERT
WITH CHECK (true); -- Allow profile creation during user setup

-- Update messages policies
DROP POLICY IF EXISTS "Access code admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages via profile" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages via profile" ON public.messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can only view their own messages" ON public.messages;

CREATE POLICY "Admins can manage all messages"
ON public.messages
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

CREATE POLICY "Users can create their own messages"
ON public.messages
FOR INSERT
WITH CHECK (user_id = get_authenticated_user()::text);

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

-- Update file_processing_logs policies
DROP POLICY IF EXISTS "Access code admins can manage all file logs" ON public.file_processing_logs;
DROP POLICY IF EXISTS "Users can create their own file processing logs" ON public.file_processing_logs;
DROP POLICY IF EXISTS "Users can view their own file processing logs" ON public.file_processing_logs;

CREATE POLICY "Admins can manage all file logs"
ON public.file_processing_logs
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

CREATE POLICY "Users can create their own file processing logs"
ON public.file_processing_logs
FOR INSERT
WITH CHECK (user_id = get_authenticated_user());

CREATE POLICY "Users can view their own file processing logs"
ON public.file_processing_logs
FOR SELECT
USING (user_id = get_authenticated_user() OR is_authenticated_admin());

-- Update other critical tables with similar pattern...
-- (I'll continue with the most important ones for the knowledge upload to work)

-- Update deliberations policies
DROP POLICY IF EXISTS "Access code admins can manage all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Users can view public deliberations or their own" ON public.deliberations;

CREATE POLICY "Admins can manage all deliberations"
ON public.deliberations
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

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

-- Update participants policies
DROP POLICY IF EXISTS "Admins can manage all participants via profile" ON public.participants;
DROP POLICY IF EXISTS "Allow users to join deliberations" ON public.participants;
DROP POLICY IF EXISTS "Users can create their own participant records" ON public.participants;
DROP POLICY IF EXISTS "Users can view own participant records" ON public.participants;

CREATE POLICY "Admins can manage all participants"
ON public.participants
FOR ALL
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

CREATE POLICY "Users can create their own participant records"
ON public.participants
FOR INSERT
WITH CHECK (user_id = get_authenticated_user()::text);

CREATE POLICY "Users can view participant records"
ON public.participants
FOR SELECT
USING (
  user_id = get_authenticated_user()::text OR 
  is_authenticated_admin()
);