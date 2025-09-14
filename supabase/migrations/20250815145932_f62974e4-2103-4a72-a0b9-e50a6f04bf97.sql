-- Security Fix 1: Restrict public access to user profiles
-- Only allow authenticated users to view profiles, or users viewing their own profile
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Security Fix 2: Restrict public access to participant data
-- Remove public access to participants in public deliberations
DROP POLICY IF EXISTS "Anyone can view participant counts for public deliberations" ON public.participants;

CREATE POLICY "Only authenticated users can view participants" 
ON public.participants 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND (
  is_user_participant_in_deliberation(deliberation_id, auth.uid()) OR 
  is_admin_user(auth.uid())
));

-- Security Fix 3: Enhanced access code validation with rate limiting protection
CREATE OR REPLACE FUNCTION public.validate_access_code_with_security(
  input_code text, 
  user_ip inet DEFAULT inet_client_addr()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    
    -- Validate code status with enhanced checks
    IF NOT code_record.is_active THEN
        INSERT INTO security_events (event_type, ip_address, details, risk_level)
        VALUES ('access_code_inactive', user_ip, 
                jsonb_build_object('code_id', code_record.id), 'medium');
        result := jsonb_build_object('valid', false, 'reason', 'code_inactive');
    ELSIF code_record.expires_at < current_time THEN
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
$$;

-- Security Fix 4: Enhanced user session security
CREATE OR REPLACE FUNCTION public.create_secure_user_session(
    p_user_id uuid,
    p_ip_address inet DEFAULT inet_client_addr(),
    p_user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_id uuid;
    session_token text;
BEGIN
    -- Generate secure session token
    session_token := encode(gen_random_bytes(32), 'hex');
    
    -- Clean up old sessions for this user (keep max 5 active sessions)
    DELETE FROM user_sessions 
    WHERE user_id = p_user_id 
    AND id NOT IN (
        SELECT id FROM user_sessions 
        WHERE user_id = p_user_id 
        ORDER BY last_active DESC 
        LIMIT 4
    );
    
    -- Create new session
    INSERT INTO user_sessions (
        user_id,
        session_token_hash,
        ip_address,
        user_agent,
        expires_at
    ) VALUES (
        p_user_id,
        crypt(session_token, gen_salt('bf')),
        p_ip_address,
        p_user_agent,
        now() + interval '24 hours'
    ) RETURNING id INTO session_id;
    
    -- Log session creation
    INSERT INTO security_events (event_type, user_id, ip_address, details, risk_level)
    VALUES ('user_session_created', p_user_id, p_ip_address, 
            jsonb_build_object('session_id', session_id), 'low');
    
    RETURN session_id;
END;
$$;

-- Security Fix 5: Add comprehensive security monitoring
CREATE OR REPLACE FUNCTION public.log_security_violation(
    p_violation_type text,
    p_user_id uuid DEFAULT auth.uid(),
    p_details jsonb DEFAULT '{}',
    p_risk_level text DEFAULT 'medium'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO security_events (
        event_type,
        user_id,
        ip_address,
        details,
        risk_level,
        user_agent
    ) VALUES (
        p_violation_type,
        p_user_id,
        inet_client_addr(),
        p_details,
        p_risk_level,
        current_setting('request.headers', true)::json->>'user-agent'
    );
    
    -- Auto-block critical violations
    IF p_risk_level = 'critical' THEN
        -- Could implement auto-blocking logic here
        RAISE NOTICE 'CRITICAL SECURITY VIOLATION: % by user % from IP %', 
            p_violation_type, p_user_id, inet_client_addr();
    END IF;
END;
$$;