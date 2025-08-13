-- Remove the overly permissive policy that allows public access to all access codes
DROP POLICY IF EXISTS "Allow access code validation for authentication" ON public.access_codes;

-- Create a secure function to validate access codes without exposing all codes
CREATE OR REPLACE FUNCTION public.validate_access_code_secure(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    code_record record;
    result jsonb := '{"valid": false, "reason": "invalid_code"}'::jsonb;
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
    
    -- Validate code status
    IF code_record.expires_at < now() THEN
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
$$;

-- Create a secure function to increment access code usage
CREATE OR REPLACE FUNCTION public.use_access_code_secure(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    code_record record;
    result jsonb;
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
    
    -- Double-check it's still valid (race condition protection)
    IF code_record.expires_at < now() OR 
       (code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_no_longer_valid');
    END IF;
    
    -- Increment usage
    UPDATE access_codes 
    SET 
        current_uses = current_uses + 1,
        last_used_at = now()
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
$$;

-- Add a restricted policy that only allows admins to view access codes
CREATE POLICY "Only admins can view access codes" 
ON public.access_codes 
FOR SELECT 
USING (is_admin_user(auth.uid()));

-- Grant execute permissions on the new functions to authenticated users
GRANT EXECUTE ON FUNCTION public.validate_access_code_secure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_access_code_secure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_access_code_secure(text) TO anon;
GRANT EXECUTE ON FUNCTION public.use_access_code_secure(text) TO anon;