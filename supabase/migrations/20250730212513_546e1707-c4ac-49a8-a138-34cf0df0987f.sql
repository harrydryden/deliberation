-- Check the current functions that might be causing recursion
SELECT proname, prosrc FROM pg_proc WHERE proname IN ('is_admin_user', 'is_participant_in_deliberation', 'is_facilitator_of_deliberation');

-- Check current policies on deliberations table
SELECT schemaname, tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'deliberations';

-- Check current policies on participants table that might reference deliberations
SELECT schemaname, tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'participants' AND (qual LIKE '%deliberation%' OR with_check LIKE '%deliberation%');