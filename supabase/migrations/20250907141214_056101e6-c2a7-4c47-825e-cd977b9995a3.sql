-- Phase 2: Function consolidation to eliminate duplicates and conflicts

-- 1. Consolidate admin check functions - keep auth_is_admin() as the canonical one
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_authenticated_admin();

-- 2. Consolidate user participation functions - keep the most robust versions
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation_safe(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_user_participant_in_deliberation(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation(uuid, uuid);

-- Keep only is_participant_in_deliberation as the canonical function
-- (it's already well-defined and used)

-- 3. Fix conflicting admin_update_agent_configuration functions
-- Drop the version with access_code parameter (legacy)
DROP FUNCTION IF EXISTS public.admin_update_agent_configuration(uuid, text, jsonb);

-- Keep the modern version that uses auth_is_admin()

-- 4. Consolidate deliberation stance functions with inconsistent parameters
-- Drop the text parameter version, keep UUID version as canonical
DROP FUNCTION IF EXISTS public.get_deliberation_stance_summary(text);
DROP FUNCTION IF EXISTS public.get_user_stance_trend(uuid, text);

-- Keep the UUID versions as they're more type-safe

-- 5. Remove duplicate facilitator check function
DROP FUNCTION IF EXISTS public.is_facilitator_of_deliberation(uuid, uuid);

-- 6. Clean up unused admin helper function
DROP FUNCTION IF EXISTS public.is_admin_user(uuid);
DROP FUNCTION IF EXISTS public.is_admin_user_simple(text);

-- 7. Remove duplicate user role function
DROP FUNCTION IF EXISTS public.get_current_user_role();

-- 8. Clean up duplicate user ID functions - keep get_authenticated_user()
DROP FUNCTION IF EXISTS public.get_current_access_code_user();
DROP FUNCTION IF EXISTS public.get_current_user_access_code();

-- Update auth_is_admin to use auth.uid() directly for consistency
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