-- Fix all timestamp comparison issues in access code validation functions

-- Fix validate_access_code_enhanced function
CREATE OR REPLACE FUNCTION public.validate_access_code_enhanced(input_code text, user_ip inet DEFAULT NULL::inet)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    code_record record;
    attempt_count integer;
    result jsonb;
    current_time timestamp with time zone := now();
BEGIN
    -- Check for brute force attempts from this IP
    SELECT COUNT(*) INTO attempt_count
    FROM security_events
    WHERE event_type = 'access_code_validation_failed'
      AND ip_address = user_ip
      AND created_at > current_time - interval '1 hour';
    
    -- Block if too many failed attempts
    IF attempt_count >= 10 THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_brute_force_detected', user_ip, 
                jsonb_build_object('attempt_count', attempt_count), 'critical');
        
        RETURN jsonb_build_object(
            'valid', false, 
            'reason', 'rate_limited',
            'blocked_until', current_time + interval '1 hour'
        );
    END IF;
    
    -- Basic format validation
    IF input_code IS NULL OR length(input_code) < 8 OR length(input_code) > 15 THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_validation_failed', user_ip, 
                jsonb_build_object('reason', 'invalid_format'), 'low');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_format');
    END IF;
    
    -- Character validation
    IF NOT (input_code ~ '^[A-Z0-9]+$') THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_validation_failed', user_ip, 
                jsonb_build_object('reason', 'invalid_characters'), 'medium');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_characters');
    END IF;
    
    -- Get access code record
    SELECT * INTO code_record FROM access_codes WHERE code = input_code;
    
    IF NOT FOUND THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_validation_failed', user_ip, 
                jsonb_build_object('reason', 'code_not_found'), 'medium');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'code_not_found');
    END IF;
    
    -- Validate code status - FIX: proper timestamp comparison
    IF NOT code_record.is_active THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_inactive');
    ELSIF code_record.expires_at IS NOT NULL AND code_record.expires_at < current_time THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_expired');
    ELSIF code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses THEN
        result := jsonb_build_object('valid', false, 'reason', 'max_uses_exceeded');
    ELSE
        -- Code is valid
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_validation_success', user_ip, 
                jsonb_build_object('code_type', code_record.code_type), 'low');
        
        result := jsonb_build_object(
            'valid', true,
            'code_type', code_record.code_type,
            'remaining_uses', CASE 
                WHEN code_record.max_uses IS NULL THEN NULL 
                ELSE code_record.max_uses - code_record.current_uses 
            END
        );
    END IF;
    
    -- Log validation attempt
    IF NOT (result->>'valid')::boolean THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_validation_failed', user_ip, result, 'medium');
    END IF;
    
    RETURN result;
END;
$function$;

-- Fix validate_access_code_secure function
CREATE OR REPLACE FUNCTION public.validate_access_code_secure(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    code_record record;
    result jsonb := '{"valid": false, "reason": "invalid_code"}'::jsonb;
    current_time timestamp with time zone := now();
BEGIN
    -- Basic input validation
    IF input_code IS NULL OR length(input_code) < 8 OR length(input_code) > 15 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_format');
    END IF;
    
    -- Character validation
    IF NOT (input_code ~ '^[A-Z0-9]+$') THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_characters');
    END IF;
    
    -- Get the specific access code record (no public exposure)
    SELECT * INTO code_record 
    FROM access_codes 
    WHERE code = input_code AND is_active = true;
    
    IF NOT FOUND THEN
        -- Log security event for invalid attempts
        INSERT INTO security_events (event_type, details, risk_level)
        VALUES ('invalid_access_code_attempt', 
                jsonb_build_object('attempted_code_length', length(input_code)), 'medium');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'code_not_found');
    END IF;
    
    -- Validate code status - FIX: proper timestamp comparison
    IF code_record.expires_at IS NOT NULL AND code_record.expires_at < current_time THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_expired');
    ELSIF code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses THEN
        result := jsonb_build_object('valid', false, 'reason', 'max_uses_exceeded');
    ELSE
        -- Code is valid - return minimal information needed
        result := jsonb_build_object(
            'valid', true,
            'code_type', code_record.code_type,
            'remaining_uses', CASE 
                WHEN code_record.max_uses IS NULL THEN NULL 
                ELSE code_record.max_uses - code_record.current_uses 
            END
        );
        
        -- Log successful validation
        INSERT INTO security_events (event_type, details, risk_level)
        VALUES ('access_code_validation_success', 
                jsonb_build_object('code_type', code_record.code_type), 'low');
    END IF;
    
    RETURN result;
END;
$function$;

-- Fix use_access_code_secure function
CREATE OR REPLACE FUNCTION public.use_access_code_secure(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    code_record record;
    result jsonb;
    current_time timestamp with time zone := now();
BEGIN
    -- First validate the code
    result := validate_access_code_secure(input_code);
    
    IF NOT (result->>'valid')::boolean THEN
        RETURN result;
    END IF;
    
    -- Get and lock the code record for update
    SELECT * INTO code_record 
    FROM access_codes 
    WHERE code = input_code AND is_active = true
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_not_found');
    END IF;
    
    -- Double-check it's still valid (race condition protection) - FIX: proper timestamp comparison
    IF (code_record.expires_at IS NOT NULL AND code_record.expires_at < current_time) OR 
       (code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_no_longer_valid');
    END IF;
    
    -- Increment usage
    UPDATE access_codes 
    SET 
        current_uses = current_uses + 1,
        last_used_at = current_time
    WHERE id = code_record.id;
    
    -- Log successful usage
    INSERT INTO security_events (event_type, details, risk_level)
    VALUES ('access_code_used', 
            jsonb_build_object('code_type', code_record.code_type), 'low');
    
    RETURN jsonb_build_object(
        'valid', true, 
        'success', true,
        'code_type', code_record.code_type
    );
END;
$function$;