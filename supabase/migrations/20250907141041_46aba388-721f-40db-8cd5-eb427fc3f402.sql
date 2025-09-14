-- Phase 1: Safe deletions with proper dependency handling
-- First drop views that depend on functions we want to remove
DROP VIEW IF EXISTS public.anonymized_messages CASCADE;

-- Now drop unused tables (verified 0 records)
DROP TABLE IF EXISTS public.classified_items CASCADE;
DROP TABLE IF EXISTS public.item_keywords CASCADE;
DROP TABLE IF EXISTS public.item_relationships CASCADE;
DROP TABLE IF EXISTS public.item_similarities CASCADE;
DROP TABLE IF EXISTS public.simplified_events CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.keywords CASCADE;

-- Drop debug functions (no longer needed)
DROP FUNCTION IF EXISTS public.debug_storage_context();
DROP FUNCTION IF EXISTS public.debug_auth_functions();
DROP FUNCTION IF EXISTS public.debug_current_user_settings();

-- Drop legacy/unused utility functions (now safe after dropping dependent view)
DROP FUNCTION IF EXISTS public.anonymize_timestamp_to_hour(timestamp with time zone);
DROP FUNCTION IF EXISTS public.anonymize_timestamp_to_day(timestamp with time zone);
DROP FUNCTION IF EXISTS public.set_config(text, text, boolean);

-- Drop unused session management functions
DROP FUNCTION IF EXISTS public.anonymize_old_sessions();
DROP FUNCTION IF EXISTS public.mark_sessions_inactive();
DROP FUNCTION IF EXISTS public.update_session_activity_simple(uuid);

-- Drop unused helper function
DROP FUNCTION IF EXISTS public.get_profile_count();