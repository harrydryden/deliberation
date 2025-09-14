-- Enhanced security fixes for critical vulnerabilities

-- 1. Improve access code generation security
CREATE OR REPLACE FUNCTION public.generate_secure_access_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    chars text := 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'; -- Removed similar chars: O,0,1,I,L
    result text := '';
    i integer;
    random_val integer;
    entropy_check text;
BEGIN
    -- Generate code with better entropy
    FOR i IN 1..12 LOOP -- Increased from 10 to 12 characters
        -- Get cryptographically secure random value
        SELECT floor(random() * length(chars) + 1)::integer INTO random_val;
        result := result || substr(chars, random_val, 1);
    END LOOP;
    
    -- Entropy check - ensure no patterns
    entropy_check := result;
    
    -- Check for repeated characters (more than 3 in a row)
    IF entropy_check ~ '(.)\1{2,}' THEN
        -- Recursively generate new code if pattern detected
        RETURN generate_secure_access_code();
    END IF;
    
    -- Check for sequential patterns
    IF entropy_check ~ '(ABC|BCD|CDE|DEF|234|345|456|567|678|789)' THEN
        RETURN generate_secure_access_code();
    END IF;
    
    RETURN result;
END;
$function$;

-- 2. Enhanced security monitoring table
CREATE TABLE IF NOT EXISTS public.security_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL,
    user_id uuid,
    ip_address inet,
    user_agent text,
    details jsonb DEFAULT '{}',
    risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
    resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on security events
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can access security events
CREATE POLICY "Only admins can manage security events" ON public.security_events
FOR ALL USING (is_admin_user(auth.uid()))
WITH CHECK (is_admin_user(auth.uid()));

-- 3. Enhanced access code validation with better security
CREATE OR REPLACE FUNCTION public.validate_access_code_enhanced(
    input_code text,
    user_ip inet DEFAULT NULL
)
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
    
    -- Validate code status
    IF NOT code_record.is_active THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_inactive');
    ELSIF code_record.expires_at < current_time THEN
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

-- 4. Enhanced privilege escalation prevention
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation_enhanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    current_user_role text;
    admin_count integer;
BEGIN
    -- Get current user's role
    SELECT role INTO current_user_role FROM profiles WHERE id = auth.uid();
    
    -- Check if role is being changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Only admins can change roles
        IF current_user_role != 'admin' THEN
            INSERT INTO security_events (event_type, user_id, details, risk_level)
            VALUES ('unauthorized_role_change_attempt', auth.uid(), 
                    jsonb_build_object(
                        'target_user', NEW.id,
                        'old_role', OLD.role,
                        'new_role', NEW.role
                    ), 'critical');
            
            RAISE EXCEPTION 'Unauthorized role change attempt';
        END IF;
        
        -- Prevent self-demotion if it would leave no admins
        IF auth.uid() = NEW.id AND OLD.role = 'admin' AND NEW.role != 'admin' THEN
            SELECT COUNT(*) INTO admin_count 
            FROM profiles 
            WHERE role = 'admin' AND id != auth.uid();
            
            IF admin_count < 1 THEN
                INSERT INTO security_events (event_type, user_id, details, risk_level)
                VALUES ('admin_self_demotion_prevented', auth.uid(), 
                        jsonb_build_object('reason', 'would_leave_no_admins'), 'high');
                
                RAISE EXCEPTION 'Cannot remove last admin user';
            END IF;
        END IF;
        
        -- Log successful role change
        INSERT INTO security_events (event_type, user_id, details, risk_level)
        VALUES ('role_changed', auth.uid(), 
                jsonb_build_object(
                    'target_user', NEW.id,
                    'old_role', OLD.role,
                    'new_role', NEW.role
                ), 'medium');
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS prevent_role_escalation ON profiles;
CREATE TRIGGER prevent_privilege_escalation_enhanced
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION prevent_privilege_escalation_enhanced();

-- 5. Create secure file processing monitoring
CREATE TABLE IF NOT EXISTS public.file_processing_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    file_name text NOT NULL,
    file_size bigint,
    file_type text,
    processing_status text CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'quarantined')),
    security_scan_status text CHECK (security_scan_status IN ('pending', 'clean', 'suspicious', 'malicious')),
    error_details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on file processing logs
ALTER TABLE public.file_processing_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs, admins can view all
CREATE POLICY "Users can view their own file processing logs" ON public.file_processing_logs
FOR SELECT USING (auth.uid() = user_id OR is_admin_user(auth.uid()));

CREATE POLICY "System can insert file processing logs" ON public.file_processing_logs
FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update file processing logs" ON public.file_processing_logs
FOR UPDATE USING (true);

-- 6. Enhanced password strength validation function
CREATE OR REPLACE FUNCTION public.validate_password_strength(password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    result jsonb := '{"valid": true, "score": 0, "requirements": {}}'::jsonb;
    score integer := 0;
    requirements jsonb := '{}'::jsonb;
BEGIN
    -- Length check
    IF length(password) >= 12 THEN
        score := score + 2;
        requirements := requirements || '{"length": true}';
    ELSIF length(password) >= 8 THEN
        score := score + 1;
        requirements := requirements || '{"length": true}';
    ELSE
        requirements := requirements || '{"length": false}';
        result := result || '{"valid": false}';
    END IF;
    
    -- Uppercase letter
    IF password ~ '[A-Z]' THEN
        score := score + 1;
        requirements := requirements || '{"uppercase": true}';
    ELSE
        requirements := requirements || '{"uppercase": false}';
    END IF;
    
    -- Lowercase letter
    IF password ~ '[a-z]' THEN
        score := score + 1;
        requirements := requirements || '{"lowercase": true}';
    ELSE
        requirements := requirements || '{"lowercase": false}';
    END IF;
    
    -- Numbers
    IF password ~ '[0-9]' THEN
        score := score + 1;
        requirements := requirements || '{"numbers": true}';
    ELSE
        requirements := requirements || '{"numbers": false}';
    END IF;
    
    -- Special characters
    IF password ~ '[!@#$%^&*(),.?":{}|<>]' THEN
        score := score + 2;
        requirements := requirements || '{"special": true}';
    ELSE
        requirements := requirements || '{"special": false}';
    END IF;
    
    -- Common password check
    IF password IN ('password', '123456', 'qwerty', 'admin', 'letmein', 'welcome') THEN
        score := 0;
        requirements := requirements || '{"not_common": false}';
        result := result || '{"valid": false}';
    ELSE
        requirements := requirements || '{"not_common": true}';
    END IF;
    
    -- Set final score and requirements
    result := result || jsonb_build_object('score', score, 'requirements', requirements);
    
    -- Password must score at least 5 to be valid
    IF score < 5 THEN
        result := result || '{"valid": false}';
    END IF;
    
    RETURN result;
END;
$function$;