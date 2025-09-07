-- Clean up broken legacy functions from old access code system
-- These functions reference non-existent tables and functions

-- Drop broken legacy functions that reference old access_codes table
DROP FUNCTION IF EXISTS public.user_participates_in_deliberation_by_code(uuid);
DROP FUNCTION IF EXISTS public.is_admin_user();
DROP FUNCTION IF EXISTS public.get_current_user_access_code();

-- Drop any remaining access_codes table references (if they still exist)
DROP TABLE IF EXISTS public.access_codes CASCADE;