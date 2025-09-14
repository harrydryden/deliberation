-- Remove all obsolete access code related database functions
DROP FUNCTION IF EXISTS public.assign_access_codes_to_users() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_access_codes() CASCADE;
DROP FUNCTION IF EXISTS public.create_user_with_access_code(text) CASCADE;
DROP FUNCTION IF EXISTS public.generate_secure_access_code() CASCADE;
DROP FUNCTION IF EXISTS public.generate_simple_access_code() CASCADE;
DROP FUNCTION IF EXISTS public.get_access_code_count() CASCADE;
DROP FUNCTION IF EXISTS public.get_access_code_type(text) CASCADE;
DROP FUNCTION IF EXISTS public.increment_access_code_usage(text) CASCADE;
DROP FUNCTION IF EXISTS public.secure_increment_access_code_usage(text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_access_code(text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_access_code_secure(text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_access_code_simple(text) CASCADE;

-- Remove access code columns from profiles table since they're no longer used
ALTER TABLE public.profiles DROP COLUMN IF EXISTS access_code_1;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS access_code_2;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS migrated_from_access_code;

-- Clean up any remaining access code related constraints and indexes
DROP INDEX IF EXISTS idx_profiles_access_code_1;
DROP INDEX IF EXISTS idx_profiles_access_code_2;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_access_code_1_format;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_access_code_2_format;