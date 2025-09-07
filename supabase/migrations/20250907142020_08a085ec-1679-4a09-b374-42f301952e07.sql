-- Phase 3: Final cleanup - most conservative approach, only definitely unused functions

-- 1. Clean up unused helper functions that are clearly not referenced
DROP FUNCTION IF EXISTS public.cleanup_expired_processing_locks();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_sessions();
DROP FUNCTION IF EXISTS public.log_security_event(text, jsonb);

-- 2. Remove unused trigger function for deleted keyword table 
DROP FUNCTION IF EXISTS public.increment_keyword_usage();

-- 3. Remove unused message rating variant (keeping the main one with user_id)
DROP FUNCTION IF EXISTS public.get_message_rating_summary(uuid);

-- 4. Remove unused access code generators if they're not being used
DROP FUNCTION IF EXISTS public.generate_access_code_1();
DROP FUNCTION IF EXISTS public.generate_access_code_2();

-- 5. Clean up unused audit logging 
DROP FUNCTION IF EXISTS public.log_admin_action(text, text, uuid, jsonb, jsonb);

-- Final optimization: Consolidate remaining admin functions to use consistent naming
-- Rename get_admin_system_stats to match naming convention
CREATE OR REPLACE FUNCTION public.admin_get_system_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin_user boolean := false;
  total_users integer := 0;
  total_deliberations integer := 0;
  total_messages integer := 0;
  active_deliberations integer := 0;
BEGIN
  -- Check if current user is admin using Supabase Auth
  SELECT auth_is_admin() INTO is_admin_user;
  
  -- If not admin, return error
  IF NOT is_admin_user THEN
    RETURN jsonb_build_object('error', 'Admin access required');
  END IF;
  
  -- Get counts directly (bypassing RLS since this is a SECURITY DEFINER function)
  SELECT COUNT(*) INTO total_users FROM profiles;
  SELECT COUNT(*) INTO total_deliberations FROM deliberations;
  SELECT COUNT(*) INTO total_messages FROM messages;
  SELECT COUNT(*) INTO active_deliberations FROM deliberations WHERE status = 'active';
  
  RETURN jsonb_build_object(
    'totalUsers', total_users,
    'totalDeliberations', total_deliberations,
    'totalMessages', total_messages,
    'activeDeliberations', active_deliberations
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Drop the old version
DROP FUNCTION IF EXISTS public.get_admin_system_stats();