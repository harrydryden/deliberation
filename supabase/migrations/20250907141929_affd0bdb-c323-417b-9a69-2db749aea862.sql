-- Phase 3: Final cleanup - only truly unused functions without dependencies

-- 1. Clean up unused helper functions that have no dependencies
DROP FUNCTION IF EXISTS public.cleanup_expired_processing_locks();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_sessions();
DROP FUNCTION IF EXISTS public.log_security_event(text, jsonb);

-- 2. Remove unused message rating variant (keep the one with user_id parameter)
DROP FUNCTION IF EXISTS public.get_message_rating_summary(uuid);

-- 3. Remove unused access code generators (if not used by triggers)
DROP FUNCTION IF EXISTS public.generate_access_code_1();
DROP FUNCTION IF EXISTS public.generate_access_code_2();

-- 4. Clean up unused trigger function for deleted tables only
DROP FUNCTION IF EXISTS public.increment_keyword_usage();

-- 5. Optimize the remaining database by consolidating similar functions
-- Create a unified get_prompt_template function that's more efficient
CREATE OR REPLACE FUNCTION public.get_prompt_template_optimized(template_name text)
RETURNS TABLE(template_text text, variables jsonb, category text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT pt.template_text, pt.variables, pt.category, pt.version
  FROM prompt_templates pt
  WHERE pt.name = template_name 
    AND pt.is_active = true
  ORDER BY pt.version DESC
  LIMIT 1;
END;
$$;