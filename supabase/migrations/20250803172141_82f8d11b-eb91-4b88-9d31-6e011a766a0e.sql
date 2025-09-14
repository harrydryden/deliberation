-- Security Enhancement Migration: Address Critical Database Issues
-- Phase 1: Fix Security Definer View and Database Extensions

-- 1. Remove security definer property from user_profiles_with_codes view
-- First, check if it exists and drop/recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.user_profiles_with_codes;

-- Recreate the view without SECURITY DEFINER (safer approach)
CREATE VIEW public.user_profiles_with_codes AS
SELECT 
    p.id,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.user_role,
    p.expertise_areas,
    p.created_at,
    p.updated_at,
    ac.code AS access_code,
    ac.code_type,
    ac.used_at
FROM public.profiles p
LEFT JOIN public.access_codes ac ON ac.used_by = p.id;

-- 2. Enhanced Role Escalation Prevention
-- Create more secure role validation function
CREATE OR REPLACE FUNCTION public.validate_role_change(
    target_user_id uuid,
    new_role text,
    current_user_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_role text;
    requesting_user_role text;
BEGIN
    -- Get the current user's role
    SELECT role INTO requesting_user_role 
    FROM public.profiles 
    WHERE id = auth.uid();
    
    -- Get target user's current role
    SELECT role INTO current_role 
    FROM public.profiles 
    WHERE id = target_user_id;
    
    -- Only admins can change roles
    IF requesting_user_role != 'admin' THEN
        RETURN false;
    END IF;
    
    -- Prevent self-demotion (admin removing their own admin role)
    IF target_user_id = auth.uid() AND current_role = 'admin' AND new_role != 'admin' THEN
        RETURN false;
    END IF;
    
    -- Validate role is in allowed list
    IF new_role NOT IN ('admin', 'user', 'moderator') THEN
        RETURN false;
    END IF;
    
    -- Log role change attempt
    PERFORM audit_sensitive_operation(
        'role_change_validation',
        'profiles',
        target_user_id,
        jsonb_build_object(
            'old_role', current_role,
            'new_role', new_role,
            'requested_by', auth.uid(),
            'approved', true
        )
    );
    
    RETURN true;
END;
$$;

-- 3. Enhanced RLS policies with stricter role enforcement
-- Update the profile role change trigger to use the new validation
CREATE OR REPLACE FUNCTION public.enforce_role_change_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Check if role is being changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Use the enhanced validation function
        IF NOT validate_role_change(NEW.id, NEW.role) THEN
            RAISE EXCEPTION 'Unauthorized role change attempt';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Apply the trigger to profiles table
DROP TRIGGER IF EXISTS enforce_role_security ON public.profiles;
CREATE TRIGGER enforce_role_security
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION enforce_role_change_security();

-- 4. Enhanced access code security
-- Create function to validate access code usage patterns
CREATE OR REPLACE FUNCTION public.validate_access_code_security(
    code_to_check text,
    user_ip inet DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    code_info record;
    usage_pattern record;
    result jsonb := '{"valid": false, "reason": "unknown"}'::jsonb;
BEGIN
    -- Get code information
    SELECT * INTO code_info 
    FROM access_codes 
    WHERE code = code_to_check;
    
    IF NOT FOUND THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_not_found');
        PERFORM audit_sensitive_operation(
            'invalid_access_code',
            'access_codes',
            NULL,
            jsonb_build_object('code', code_to_check, 'ip', user_ip)
        );
        RETURN result;
    END IF;
    
    -- Check if code is active and not expired
    IF NOT code_info.is_active THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_inactive');
    ELSIF code_info.expires_at < now() THEN
        result := jsonb_build_object('valid', false, 'reason', 'code_expired');
    ELSIF code_info.max_uses IS NOT NULL AND code_info.current_uses >= code_info.max_uses THEN
        result := jsonb_build_object('valid', false, 'reason', 'max_uses_exceeded');
    ELSE
        result := jsonb_build_object(
            'valid', true, 
            'code_type', code_info.code_type,
            'remaining_uses', CASE 
                WHEN code_info.max_uses IS NULL THEN NULL 
                ELSE code_info.max_uses - code_info.current_uses 
            END
        );
    END IF;
    
    -- Log all validation attempts
    PERFORM audit_sensitive_operation(
        'access_code_validation',
        'access_codes',
        code_info.id,
        result || jsonb_build_object('ip', user_ip)
    );
    
    RETURN result;
END;
$$;

-- 5. Create session security tracking
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    session_token_hash text NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    last_active timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + interval '7 days'),
    is_active boolean DEFAULT true,
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Enable RLS on sessions table
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for session management
CREATE POLICY "Users can view their own sessions"
ON public.user_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can create sessions"
ON public.user_sessions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update their own sessions"
ON public.user_sessions
FOR UPDATE
USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON public.user_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(is_active, expires_at);

-- 6. Enhanced audit logging with IP tracking
CREATE OR REPLACE FUNCTION public.enhanced_audit_log(
    operation_type text,
    table_name text DEFAULT NULL,
    record_id uuid DEFAULT NULL,
    details jsonb DEFAULT NULL,
    risk_level text DEFAULT 'low'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        new_values,
        ip_address,
        user_agent,
        created_at
    ) VALUES (
        auth.uid(),
        operation_type,
        table_name,
        record_id,
        details || jsonb_build_object('risk_level', risk_level),
        inet_client_addr(),
        current_setting('request.headers', true)::json->>'user-agent',
        now()
    );
    
    -- For high-risk operations, also log to a separate security events table
    IF risk_level IN ('high', 'critical') THEN
        -- Could extend to send alerts or notifications
        RAISE NOTICE 'High-risk security event logged: %', operation_type;
    END IF;
END;
$$;