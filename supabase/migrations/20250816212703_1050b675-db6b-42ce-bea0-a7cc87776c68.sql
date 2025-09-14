-- Simplify access code validation to single lightweight function
-- Drop complex validation functions
DROP FUNCTION IF EXISTS public.validate_access_code_enhanced(text, inet);
DROP FUNCTION IF EXISTS public.validate_access_code_security(text, inet);
DROP FUNCTION IF EXISTS public.validate_access_code_with_security(text, inet);
DROP FUNCTION IF EXISTS public.use_access_code_secure(text);

-- Keep only the simple validation function and optimize it
CREATE OR REPLACE FUNCTION public.validate_access_code_simple(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    code_record record;
BEGIN
    -- Basic validation
    IF input_code IS NULL OR length(input_code) != 10 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_format');
    END IF;
    
    -- Get access code record (simple query)
    SELECT code_type, is_active, expires_at, max_uses, current_uses 
    INTO code_record 
    FROM access_codes 
    WHERE code = input_code AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_not_found');
    END IF;
    
    -- Simple expiration check
    IF code_record.expires_at IS NOT NULL AND code_record.expires_at < now() THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_expired');
    END IF;
    
    -- Simple usage check
    IF code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'max_uses_exceeded');
    END IF;
    
    -- Update usage (simple increment)
    UPDATE access_codes 
    SET current_uses = current_uses + 1, last_used_at = now()
    WHERE code = input_code;
    
    -- Return success
    RETURN jsonb_build_object(
        'valid', true,
        'code_type', code_record.code_type,
        'remaining_uses', CASE 
            WHEN code_record.max_uses IS NULL THEN NULL 
            ELSE code_record.max_uses - code_record.current_uses
        END
    );
END;
$$;

-- Simplify admin check function
CREATE OR REPLACE FUNCTION public.is_admin_user_simple(access_code text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = access_code AND code_type = 'admin' AND is_active = true
  );
$$;

-- Drop complex security functions that aren't needed
DROP FUNCTION IF EXISTS public.detect_suspicious_activity(uuid, inet, interval);
DROP FUNCTION IF EXISTS public.log_security_violation(text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.validate_password_strength(text);
DROP FUNCTION IF EXISTS public.create_secure_user_session(uuid, inet, text);

-- Simplify RLS policies to use access codes instead of complex auth
-- Remove complex user role checks since we're using simple access codes

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.validate_access_code_simple(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_access_code_simple(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user_simple(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user_simple(text) TO authenticated;