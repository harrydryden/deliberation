-- Fix security warnings from the linter

-- 1. Fix function search path mutable issues by setting search_path
CREATE OR REPLACE FUNCTION public.validate_access_code(input_code text)
RETURNS TABLE(
  valid boolean,
  code_type text,
  expired boolean,
  max_uses_reached boolean
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN ac.id IS NULL THEN false
      WHEN NOT ac.is_active THEN false
      WHEN ac.expires_at < now() THEN false
      WHEN ac.max_uses IS NOT NULL AND ac.current_uses >= ac.max_uses THEN false
      ELSE true
    END as valid,
    ac.code_type,
    CASE WHEN ac.expires_at < now() THEN true ELSE false END as expired,
    CASE WHEN ac.max_uses IS NOT NULL AND ac.current_uses >= ac.max_uses THEN true ELSE false END as max_uses_reached
  FROM access_codes ac
  WHERE ac.code = input_code;
  
  -- If no record found, return false values
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, null::text, false, false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_access_code_usage(input_code text)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
  code_record RECORD;
BEGIN
  -- Get the access code record
  SELECT * INTO code_record FROM access_codes WHERE code = input_code;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Update usage count and last used timestamp
  UPDATE access_codes 
  SET 
    current_uses = current_uses + 1,
    last_used_at = now()
  WHERE code = input_code;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_access_codes()
RETURNS integer 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Mark expired codes as inactive instead of deleting them for audit purposes
  UPDATE access_codes 
  SET is_active = false 
  WHERE expires_at < now() AND is_active = true;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;