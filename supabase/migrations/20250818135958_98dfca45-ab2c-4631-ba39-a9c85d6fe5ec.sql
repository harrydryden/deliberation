-- First fix storage policies that depend on access code functions
-- Update storage policies to use Supabase Auth
DROP POLICY IF EXISTS "Users can view their own files in documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder in documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files in documents" ON storage.objects;

-- Create new storage policies using Supabase Auth
CREATE POLICY "Users can view their own files in documents" ON storage.objects
FOR SELECT USING (
  bucket_id = 'documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload to their own folder in documents" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own files in documents" ON storage.objects
FOR DELETE USING (
  bucket_id = 'documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Now we can safely drop the obsolete access code functions
DROP FUNCTION IF EXISTS public.get_current_access_code_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_user_access_code() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_user_id_clean() CASCADE;
DROP FUNCTION IF EXISTS public.is_current_user_admin() CASCADE;
DROP FUNCTION IF EXISTS public.get_admin_system_stats() CASCADE;

-- Update admin repository to use new function
CREATE OR REPLACE FUNCTION public.get_admin_system_stats()
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
  total_access_codes integer := 0;
  used_access_codes integer := 0;
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
  SELECT COUNT(*) INTO total_access_codes FROM access_codes;
  SELECT COUNT(*) INTO used_access_codes FROM access_codes WHERE is_used = true;
  
  RETURN jsonb_build_object(
    'totalUsers', total_users,
    'totalDeliberations', total_deliberations,
    'totalMessages', total_messages,
    'activeDeliberations', active_deliberations,
    'totalAccessCodes', total_access_codes,
    'usedAccessCodes', used_access_codes
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

COMMENT ON SCHEMA public IS 'Auth system completely migrated to Supabase Auth';