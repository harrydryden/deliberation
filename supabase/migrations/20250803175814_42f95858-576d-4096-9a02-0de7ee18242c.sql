-- Fix security definer view issue by making views explicit as SECURITY INVOKER
-- This ensures views use the permissions of the querying user, not the view creator

-- First, check if there are any views with security definer (they'll be recreated as security invoker)
-- Drop and recreate user_profiles_with_codes view as SECURITY INVOKER
DROP VIEW IF EXISTS public.user_profiles_with_codes;

-- Recreate as a proper SECURITY INVOKER view
CREATE VIEW public.user_profiles_with_codes 
WITH (security_invoker = true)
AS
SELECT 
    p.id,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.user_role,
    p.expertise_areas,
    p.created_at,
    p.updated_at,
    ac.code as access_code,
    ac.code_type,
    ac.used_at
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id;

-- Create indexes for better performance on security-related tables
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_risk_level ON public.security_events(risk_level);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON public.security_events(ip_address);

-- Create index for file processing logs
CREATE INDEX IF NOT EXISTS idx_file_processing_logs_user_id ON public.file_processing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_file_processing_logs_processing_status ON public.file_processing_logs(processing_status);
CREATE INDEX IF NOT EXISTS idx_file_processing_logs_security_scan_status ON public.file_processing_logs(security_scan_status);

-- Enhanced security function for monitoring suspicious activity
CREATE OR REPLACE FUNCTION public.detect_suspicious_activity(
    p_user_id uuid DEFAULT NULL,
    p_ip_address inet DEFAULT NULL,
    p_time_window interval DEFAULT '1 hour'::interval
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- Use SECURITY INVOKER explicitly
SET search_path TO 'public'
AS $function$
DECLARE
    result jsonb := '{"suspicious": false, "reasons": []}'::jsonb;
    reasons text[] := '{}';
    event_count integer;
    failed_auth_count integer;
    different_ips_count integer;
BEGIN
    -- Check for high number of events from same user
    IF p_user_id IS NOT NULL THEN
        SELECT COUNT(*) INTO event_count
        FROM security_events
        WHERE user_id = p_user_id 
          AND created_at > now() - p_time_window;
        
        IF event_count > 50 THEN
            reasons := array_append(reasons, 'high_event_frequency');
        END IF;
        
        -- Check for failed auth attempts
        SELECT COUNT(*) INTO failed_auth_count
        FROM security_events
        WHERE user_id = p_user_id
          AND event_type LIKE '%failed%'
          AND created_at > now() - p_time_window;
        
        IF failed_auth_count > 10 THEN
            reasons := array_append(reasons, 'multiple_failed_attempts');
        END IF;
        
        -- Check for multiple different IPs
        SELECT COUNT(DISTINCT ip_address) INTO different_ips_count
        FROM security_events
        WHERE user_id = p_user_id
          AND created_at > now() - p_time_window;
        
        IF different_ips_count > 5 THEN
            reasons := array_append(reasons, 'multiple_ip_addresses');
        END IF;
    END IF;
    
    -- Check for high number of events from same IP
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(*) INTO event_count
        FROM security_events
        WHERE ip_address = p_ip_address
          AND created_at > now() - p_time_window;
        
        IF event_count > 100 THEN
            reasons := array_append(reasons, 'high_ip_activity');
        END IF;
    END IF;
    
    -- Set result
    IF array_length(reasons, 1) > 0 THEN
        result := jsonb_build_object(
            'suspicious', true,
            'reasons', reasons,
            'event_count', event_count,
            'risk_score', array_length(reasons, 1) * 25
        );
    END IF;
    
    RETURN result;
END;
$function$;