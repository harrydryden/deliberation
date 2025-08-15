-- Fix the timestamp comparison issue in validate_access_code_with_security function
CREATE OR REPLACE FUNCTION public.validate_access_code_with_security(input_code text, user_ip inet DEFAULT inet_client_addr())
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
    IF attempt_count >= 5 THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_brute_force_blocked', user_ip, 
                jsonb_build_object('attempt_count', attempt_count), 'critical');
        
        RETURN jsonb_build_object(
            'valid', false, 
            'reason', 'rate_limited',
            'blocked_until', current_time + interval '1 hour'
        );
    END IF;
    
    -- Enhanced input validation
    IF input_code IS NULL OR length(input_code) < 8 OR length(input_code) > 15 THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_invalid_format', user_ip, 
                jsonb_build_object('reason', 'invalid_format', 'length', length(input_code)), 'medium');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_format');
    END IF;
    
    -- Character validation - only allow alphanumeric
    IF NOT (input_code ~ '^[A-Z0-9]+$') THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_invalid_characters', user_ip, 
                jsonb_build_object('reason', 'invalid_characters'), 'high');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_characters');
    END IF;
    
    -- Get access code record with row lock
    SELECT * INTO code_record 
    FROM access_codes 
    WHERE code = input_code 
    FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_not_found', user_ip, 
                jsonb_build_object('attempted_code_pattern', substring(input_code, 1, 2) || '***'), 'medium');
        
        RETURN jsonb_build_object('valid', false, 'reason', 'code_not_found');
    END IF;
    
    -- Validate code status with enhanced checks - FIX: proper timestamp comparison
    IF NOT code_record.is_active THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_inactive', user_ip, 
                jsonb_build_object('code_id', code_record.id), 'medium');
        result := jsonb_build_object('valid', false, 'reason', 'code_inactive');
    ELSIF code_record.expires_at IS NOT NULL AND code_record.expires_at < current_time THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_expired', user_ip, 
                jsonb_build_object('code_id', code_record.id, 'expired_at', code_record.expires_at), 'medium');
        result := jsonb_build_object('valid', false, 'reason', 'code_expired');
    ELSIF code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_max_uses_exceeded', user_ip, 
                jsonb_build_object('code_id', code_record.id, 'max_uses', code_record.max_uses), 'medium');
        result := jsonb_build_object('valid', false, 'reason', 'max_uses_exceeded');
    ELSE
        -- Code is valid - log success and increment usage
        UPDATE access_codes 
        SET 
            current_uses = current_uses + 1,
            last_used_at = current_time
        WHERE id = code_record.id;
        
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_validation_success', user_ip, 
                jsonb_build_object('code_type', code_record.code_type, 'code_id', code_record.id), 'low');
        
        result := jsonb_build_object(
            'valid', true,
            'code_type', code_record.code_type,
            'remaining_uses', CASE 
                WHEN code_record.max_uses IS NULL THEN NULL 
                ELSE code_record.max_uses - code_record.current_uses - 1
            END
        );
    END IF;
    
    RETURN result;
END;
$function$