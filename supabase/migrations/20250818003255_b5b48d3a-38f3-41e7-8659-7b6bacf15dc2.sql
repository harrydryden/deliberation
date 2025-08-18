-- Check for any RLS policies that might reference display_name
SELECT schemaname, tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public';

-- Also check for any functions that might reference display_name in their definitions
SELECT proname, prosrc 
FROM pg_proc 
WHERE prosrc ILIKE '%display_name%' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');