-- Fix function search paths for security compliance
-- Update all functions to have proper search_path settings

-- Update increment_keyword_usage function
CREATE OR REPLACE FUNCTION public.increment_keyword_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.keywords 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.keyword_id;
    RETURN NEW;
END;
$function$;

-- Update update_facilitator_sessions_updated_at function
CREATE OR REPLACE FUNCTION public.update_facilitator_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Update update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;