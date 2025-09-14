-- Phase 2: Use CASCADE to drop conflicting functions and recreate policies

-- Drop functions with CASCADE to remove dependent policies, then recreate them properly
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_authenticated_admin() CASCADE;

-- Recreate the essential deliberations policies using auth_is_admin()
CREATE POLICY "Admins can manage all deliberations" 
ON public.deliberations 
FOR ALL 
TO authenticated
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());

CREATE POLICY "Users can view public deliberations and their own" 
ON public.deliberations 
FOR SELECT 
TO authenticated
USING (
  (is_public = true) OR 
  auth_is_admin() OR 
  (id IN (SELECT participants.deliberation_id FROM participants WHERE participants.user_id = (auth.uid())::text))
);

-- Recreate storage policy using auth_is_admin()
CREATE POLICY "Admins can manage all documents" 
ON storage.objects 
FOR ALL 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());

-- Now drop the remaining duplicate functions
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation_safe(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_user_participant_in_deliberation(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_update_agent_configuration(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.get_deliberation_stance_summary(text);
DROP FUNCTION IF EXISTS public.get_user_stance_trend(uuid, text);
DROP FUNCTION IF EXISTS public.is_facilitator_of_deliberation(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_admin_user(uuid);
DROP FUNCTION IF EXISTS public.is_admin_user_simple(text);
DROP FUNCTION IF EXISTS public.get_current_user_role();
DROP FUNCTION IF EXISTS public.get_current_access_code_user();
DROP FUNCTION IF EXISTS public.get_current_user_access_code();
DROP FUNCTION IF EXISTS public.get_user_deliberation_ids(text);
DROP FUNCTION IF EXISTS public.get_user_deliberation_ids_safe(uuid);
DROP FUNCTION IF EXISTS public.can_user_change_role(uuid, text);
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);