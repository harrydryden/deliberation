-- Fix the get_admin_system_stats function to work without access_codes table
DROP FUNCTION IF EXISTS get_admin_system_stats();

CREATE OR REPLACE FUNCTION public.get_admin_system_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$