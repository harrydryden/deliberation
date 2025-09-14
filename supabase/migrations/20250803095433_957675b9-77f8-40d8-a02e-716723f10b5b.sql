-- Fix Security issues step by step

-- First, let's fix the role elevation vulnerability in profiles table
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Recreate with more secure policies that prevent role escalation
CREATE POLICY "Users can update their own profile (no role change)" ON public.profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id AND 
    -- Prevent users from changing their own role unless they're admin
    (OLD.user_role IS NOT DISTINCT FROM NEW.user_role OR 
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_role = 'admin'))
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
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'valid_user_roles' 
        AND table_name = 'profiles'
    ) THEN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT valid_user_roles 
        CHECK (user_role IN ('admin', 'moderator', 'user'));
    END IF;
END $$;

-- Create a more secure access code validation function with input sanitization
CREATE OR REPLACE FUNCTION public.validate_access_code_secure(input_code text)
RETURNS TABLE(valid boolean, code_type text, expired boolean, max_uses_reached boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Input validation and sanitization
  IF input_code IS NULL OR length(trim(input_code)) != 10 THEN
    RETURN QUERY SELECT false, null::text, false, false;
    RETURN;
  END IF;
  
  -- Sanitize input: remove whitespace, convert to uppercase, remove invalid chars
  input_code := upper(regexp_replace(trim(input_code), '[^A-Z0-9]', '', 'g'));
  
  -- Validate length after sanitization
  IF length(input_code) != 10 THEN
    RETURN QUERY SELECT false, null::text, false, false;
    RETURN;
  END IF;
  
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