-- Fix the remaining storage policy and complete function consolidation

-- Update storage policy that still uses is_admin()
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;

CREATE POLICY "Admins can manage all documents" 
ON storage.objects 
FOR ALL 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());

-- Now safely consolidate all duplicate functions
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_authenticated_admin();
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