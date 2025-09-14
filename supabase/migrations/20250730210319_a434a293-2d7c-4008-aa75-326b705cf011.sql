-- Fix critical security vulnerabilities (revised)

-- 1. Fix SECURITY DEFINER functions to include search_path
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND user_role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_facilitator_of_deliberation(deliberation_id uuid, user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM deliberations 
    WHERE deliberations.id = $1 
    AND deliberations.facilitator_id = $2
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_participant_in_deliberation(deliberation_id uuid, user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = $1 
    AND participants.user_id = $2
  );
$function$;

-- 2. Fix role escalation vulnerability - strengthen RLS policy on profiles
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile (non-role fields only)"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND 
        -- Prevent role escalation - only admins can change roles
        (
            user_role = (SELECT user_role FROM public.profiles WHERE id = auth.uid()) OR
            is_admin_user(auth.uid())
        )
    );

-- 3. Create separate policy for admin role management
CREATE POLICY "Admins can manage user roles"
    ON public.profiles FOR UPDATE
    USING (is_admin_user(auth.uid()))
    WITH CHECK (is_admin_user(auth.uid()));

-- 4. Add audit logging for role changes
CREATE TABLE IF NOT EXISTS public.role_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id),
    old_role text,
    new_role text,
    changed_by uuid REFERENCES public.profiles(id),
    changed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
    ON public.role_audit_log FOR SELECT
    USING (is_admin_user(auth.uid()));

-- 5. Create trigger to log role changes and prevent escalation
CREATE OR REPLACE FUNCTION public.log_role_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log role changes
    IF OLD.user_role IS DISTINCT FROM NEW.user_role THEN
        INSERT INTO public.role_audit_log (user_id, old_role, new_role, changed_by)
        VALUES (NEW.id, OLD.user_role, NEW.user_role, auth.uid());
        
        -- Prevent self-escalation to admin (unless already admin)
        IF NEW.user_role = 'admin' AND OLD.user_role != 'admin' AND NEW.id = auth.uid() THEN
            -- Only allow if changed by an existing admin
            IF NOT is_admin_user(auth.uid()) THEN
                RAISE EXCEPTION 'Cannot self-escalate to admin role';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER audit_role_changes
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.log_role_changes();

-- 6. Strengthen access code constraints
ALTER TABLE public.access_codes ADD CONSTRAINT access_code_length_check 
CHECK (length(code) >= 12);

ALTER TABLE public.access_codes ADD CONSTRAINT access_code_format_check 
CHECK (code ~ '^[A-Z0-9]+$');

-- 7. Add failed authentication attempts tracking
CREATE TABLE IF NOT EXISTS public.auth_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    access_code text,
    ip_address inet,
    user_agent text,
    success boolean DEFAULT false,
    attempted_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can log auth attempts"
    ON public.auth_attempts FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view auth attempts"
    ON public.auth_attempts FOR SELECT
    USING (is_admin_user(auth.uid()));

-- 8. Add rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier text NOT NULL, -- IP address or user ID
    action text NOT NULL, -- 'auth_attempt', 'api_call', etc.
    count integer DEFAULT 1,
    window_start timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT now() + interval '1 hour'
);

CREATE INDEX idx_rate_limits_identifier_action ON public.rate_limits(identifier, action);
CREATE INDEX idx_rate_limits_expires ON public.rate_limits(expires_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage rate limits"
    ON public.rate_limits FOR ALL
    USING (true)
    WITH CHECK (true);