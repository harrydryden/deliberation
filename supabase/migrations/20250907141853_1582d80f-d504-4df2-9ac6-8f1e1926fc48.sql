-- Phase 3: Final cleanup - only application-specific unused functions

-- 1. Clean up unused helper functions (non-extension)
DROP FUNCTION IF EXISTS public.cleanup_expired_processing_locks();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_sessions();
DROP FUNCTION IF EXISTS public.log_security_event(text, jsonb);

-- 2. Remove unused trigger function for deleted keyword table
DROP FUNCTION IF EXISTS public.increment_keyword_usage();

-- 3. Clean up unused administrative functions
DROP FUNCTION IF EXISTS public.ensure_agent_config_exists();

-- 4. Remove unused message rating variant (keep the one with user_id)
DROP FUNCTION IF EXISTS public.get_message_rating_summary(uuid);

-- 5. Clean up unused lock management
DROP FUNCTION IF EXISTS public.log_admin_action(text, text, uuid, jsonb, jsonb);

-- 6. Remove unused access code generators that aren't being used
DROP FUNCTION IF EXISTS public.generate_access_code_1();
DROP FUNCTION IF EXISTS public.generate_access_code_2();

-- 7. Clean up unused user helper
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 8. Remove unused update triggers for deleted tables
DROP FUNCTION IF EXISTS public.update_prompt_templates_updated_at();
DROP FUNCTION IF EXISTS public.update_agent_configurations_updated_at();
DROP FUNCTION IF EXISTS public.update_facilitator_sessions_updated_at();
DROP FUNCTION IF EXISTS public.update_user_stance_scores_updated_at();
DROP FUNCTION IF EXISTS public.update_agent_ratings_updated_at();
DROP FUNCTION IF EXISTS public.update_updated_at_column();