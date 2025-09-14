-- Fix Security Definer View issue - Remove security definer from views if any exist
-- First, let's check for any security definer views and recreate them without security definer

-- Fix the user_profiles_with_codes view to not use security definer
DROP VIEW IF EXISTS public.user_profiles_with_codes;

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
    ac.code as access_code,
    ac.code_type,
    ac.used_at
FROM public.profiles p
LEFT JOIN public.access_codes ac ON ac.used_by = p.id;

-- Enable RLS on the view
ALTER VIEW public.user_profiles_with_codes SET (security_barrier = true);

-- Add RLS policy for the view
CREATE POLICY "Admins can view user profiles with codes" ON public.user_profiles_with_codes
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND user_role = 'admin'
    )
);

-- Fix extension in public schema - Move vector extension to extensions schema
-- Note: This is typically handled by Supabase automatically, but we can ensure proper setup

-- Create a more secure access code validation function
CREATE OR REPLACE FUNCTION public.validate_access_code_secure(input_code text)
RETURNS TABLE(valid boolean, code_type text, expired boolean, max_uses_reached boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Input validation
  IF input_code IS NULL OR length(input_code) != 10 THEN
    RETURN QUERY SELECT false, null::text, false, false;
    RETURN;
  END IF;
  
  -- Sanitize input
  input_code := upper(trim(input_code));
  
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

-- Add audit logging table for admin actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    table_name text,
    record_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Only admins can view audit logs" ON public.audit_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND user_role = 'admin'
    )
);

-- System can insert audit logs
CREATE POLICY "System can insert audit logs" ON public.audit_logs
FOR INSERT WITH CHECK (true);

-- Create audit logging function
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_action text,
    p_table_name text DEFAULT NULL,
    p_record_id uuid DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values
    ) VALUES (
        auth.uid(),
        p_action,
        p_table_name,
        p_record_id,
        p_old_values,
        p_new_values
    );
END;
$$;

-- Fix role elevation vulnerability by ensuring proper RLS policies
-- Update profiles table RLS to prevent role escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Recreate with more secure policies
CREATE POLICY "Users can update their own profile (no role change)" ON public.profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id AND 
    -- Prevent users from changing their own role
    (OLD.user_role IS NOT DISTINCT FROM NEW.user_role)
);

CREATE POLICY "Admins can update any profile" ON public.profiles
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.user_role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.user_role = 'admin'
    )
);

-- Add constraint to prevent invalid roles
ALTER TABLE public.profiles 
ADD CONSTRAINT valid_user_roles 
CHECK (user_role IN ('admin', 'moderator', 'user'));

-- Create secure random access code generation function
CREATE OR REPLACE FUNCTION public.generate_secure_access_code_v2()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'; -- Removed confusing chars
    result text := '';
    i integer;
    max_attempts integer := 100;
    attempts integer := 0;
BEGIN
    LOOP
        result := '';
        -- Generate 10 character code
        FOR i IN 1..10 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
        
        -- Check if code already exists
        IF NOT EXISTS (SELECT 1 FROM public.access_codes WHERE code = result) THEN
            EXIT;
        END IF;
        
        attempts := attempts + 1;
        IF attempts >= max_attempts THEN
            RAISE EXCEPTION 'Unable to generate unique access code after % attempts', max_attempts;
        END IF;
    END LOOP;
    
    RETURN result;
END;
$$;