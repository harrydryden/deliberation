-- Phase 3: Final cleanup - safe optimizations only

-- 1. Clean up unused helper functions that are safe to remove
DROP FUNCTION IF EXISTS public.cleanup_expired_processing_locks();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_sessions();
DROP FUNCTION IF EXISTS public.log_security_event(text, jsonb);

-- 2. Remove unused trigger functions for tables we deleted
DROP FUNCTION IF EXISTS public.increment_keyword_usage();

-- 3. Clean up unused message rating helper (keeping the main one)
DROP FUNCTION IF EXISTS public.get_message_rating_summary(uuid);

-- 4. Remove unused array conversion functions that aren't being used
DROP FUNCTION IF EXISTS public.array_to_vector(double precision[], integer, boolean);
DROP FUNCTION IF EXISTS public.array_to_vector(numeric[], integer, boolean);
DROP FUNCTION IF EXISTS public.array_to_vector(integer[], integer, boolean);
DROP FUNCTION IF EXISTS public.array_to_vector(real[], integer, boolean);

-- 5. Clean up unused aggregate functions
DROP FUNCTION IF EXISTS public.vector_accum(double precision[], vector);
DROP FUNCTION IF EXISTS public.vector_avg(double precision[]);
DROP FUNCTION IF EXISTS public.vector_combine(double precision[], double precision[]);

-- 6. Remove unused conversion functions
DROP FUNCTION IF EXISTS public.vector(vector, integer, boolean);
DROP FUNCTION IF EXISTS public.vector_to_float4(vector, integer, boolean);

-- 7. Clean up unused administrative functions
DROP FUNCTION IF EXISTS public.ensure_agent_config_exists();