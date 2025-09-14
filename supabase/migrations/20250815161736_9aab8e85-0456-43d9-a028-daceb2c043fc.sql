-- Drop the problematic function and recreate it completely
DROP FUNCTION IF EXISTS public.validate_access_code_with_security(text, inet);

-- Create a simple, working access code validation function
CREATE OR REPLACE FUNCTION public.validate_access_code_simple(input_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    code_record record;
    current_timestamp timestamptz := now();
BEGIN
    -- Basic input validation
    IF input_code IS NULL OR length(input_code) < 8 OR length(input_code) > 15 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'invalid_format');
    END IF;
    
    -- Get access code record
    SELECT * INTO code_record 
    FROM access_codes 
    WHERE code = input_code AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_not_found');
    END IF;
    
    -- Check expiration (fixed timestamp comparison)
    IF code_record.expires_at IS NOT NULL AND code_record.expires_at < current_timestamp THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'code_expired');
    END IF;
    
    -- Check usage limits
    IF code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'max_uses_exceeded');
    END IF;
    
    -- Update usage count
    UPDATE access_codes 
    SET 
        current_uses = current_uses + 1,
        last_used_at = current_timestamp
    WHERE id = code_record.id;
    
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
$function$;

-- Grant execute permissions to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.validate_access_code_simple(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_access_code_simple(text) TO authenticated;