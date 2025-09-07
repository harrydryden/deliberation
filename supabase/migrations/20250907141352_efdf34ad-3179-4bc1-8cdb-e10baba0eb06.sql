-- Phase 2 continued: Now safely consolidate duplicate functions

-- Consolidate admin check functions - now safe to drop
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_authenticated_admin();

-- Consolidate user participation functions - keep only is_participant_in_deliberation
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation_safe(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_user_participant_in_deliberation(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation(uuid, uuid);

-- Fix conflicting admin_update_agent_configuration functions
DROP FUNCTION IF EXISTS public.admin_update_agent_configuration(uuid, text, jsonb);

-- Consolidate deliberation stance functions with inconsistent parameters
DROP FUNCTION IF EXISTS public.get_deliberation_stance_summary(text);
DROP FUNCTION IF EXISTS public.get_user_stance_trend(uuid, text);

-- Remove duplicate functions
DROP FUNCTION IF EXISTS public.is_facilitator_of_deliberation(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_admin_user(uuid);
DROP FUNCTION IF EXISTS public.is_admin_user_simple(text);
DROP FUNCTION IF EXISTS public.get_current_user_role();
DROP FUNCTION IF EXISTS public.get_current_access_code_user();
DROP FUNCTION IF EXISTS public.get_current_user_access_code();

-- Clean up unused deliberation helper functions
DROP FUNCTION IF EXISTS public.get_user_deliberation_ids(text);
DROP FUNCTION IF EXISTS public.get_user_deliberation_ids_safe(uuid);

-- Remove can_user_change_role as it was unused
DROP FUNCTION IF EXISTS public.can_user_change_role(uuid, text);

-- Remove duplicate user helper function
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);