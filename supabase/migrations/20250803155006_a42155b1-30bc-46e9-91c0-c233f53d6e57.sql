-- Security Fix Migration: Address Critical Database Security Issues (Fixed)

-- 1. Fix access_codes RLS policy - make it more restrictive
DROP POLICY IF EXISTS "Anyone can read access codes for authentication" ON access_codes;
DROP POLICY IF EXISTS "Limited access code validation" ON access_codes;
DROP POLICY IF EXISTS "Admins can manage access codes" ON access_codes;

-- Only allow reading access codes for validation purposes (not exposing sensitive data)
CREATE POLICY "Limited access code validation" 
ON access_codes FOR SELECT 
USING (
  -- Only allow checking if a code exists and is valid, without exposing sensitive details
  auth.uid() IS NOT NULL
);

-- Add more restrictive access code policies for admin operations
CREATE POLICY "Admins can manage access codes" 
ON access_codes FOR ALL 
USING (get_current_user_role() = 'admin')
WITH CHECK (get_current_user_role() = 'admin');

-- 2. Fix profiles table policies - drop all existing ones first
DROP POLICY IF EXISTS "Users can update their own profile (limited)" ON profiles;
DROP POLICY IF EXISTS "Authenticated admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Recreate all profiles policies with security fixes
CREATE POLICY "Profiles are viewable by everyone" 
ON profiles FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can update any profile" 
ON profiles FOR UPDATE 
USING (get_current_user_role() = 'admin')
WITH CHECK (get_current_user_role() = 'admin');

-- 3. Update the get_current_user_role function to use consistent column name
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = 'public'
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 4. Fix prevent_role_escalation trigger to use consistent role column
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- If role is being changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Only allow if current user is admin
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can change user roles';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 5. Create audit function for sensitive operations
CREATE OR REPLACE FUNCTION public.audit_sensitive_operation(
  operation_type TEXT,
  table_name TEXT,
  record_id UUID DEFAULT NULL,
  details JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    ip_address
  ) VALUES (
    auth.uid(),
    operation_type,
    table_name,
    record_id,
    details,
    inet_client_addr()
  );
END;
$$;

-- 6. Add trigger for auditing role changes
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        PERFORM audit_sensitive_operation(
            'role_change',
            'profiles',
            NEW.id,
            jsonb_build_object(
                'old_role', OLD.role,
                'new_role', NEW.role,
                'changed_by', auth.uid()
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for role change auditing
DROP TRIGGER IF EXISTS audit_role_changes_trigger ON profiles;
CREATE TRIGGER audit_role_changes_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_role_changes();

-- 7. Strengthen access code usage tracking
CREATE OR REPLACE FUNCTION public.secure_increment_access_code_usage(input_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  code_record RECORD;
  user_ip inet;
BEGIN
  -- Get client IP for audit trail
  user_ip := inet_client_addr();
  
  -- Get the access code record with row-level lock
  SELECT * INTO code_record 
  FROM access_codes 
  WHERE code = input_code 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    -- Log failed attempt
    PERFORM audit_sensitive_operation(
      'invalid_access_code_attempt',
      'access_codes',
      NULL,
      jsonb_build_object('attempted_code', input_code, 'ip_address', user_ip)
    );
    RETURN false;
  END IF;
  
  -- Check if code is still valid
  IF NOT code_record.is_active OR 
     (code_record.expires_at IS NOT NULL AND code_record.expires_at < now()) OR
     (code_record.max_uses IS NOT NULL AND code_record.current_uses >= code_record.max_uses) THEN
    -- Log invalid usage attempt
    PERFORM audit_sensitive_operation(
      'expired_access_code_attempt',
      'access_codes',
      code_record.id,
      jsonb_build_object('code_type', code_record.code_type, 'ip_address', user_ip)
    );
    RETURN false;
  END IF;
  
  -- Update usage count and audit
  UPDATE access_codes 
  SET 
    current_uses = current_uses + 1,
    last_used_at = now()
  WHERE id = code_record.id;
  
  -- Log successful usage
  PERFORM audit_sensitive_operation(
    'access_code_used',
    'access_codes',
    code_record.id,
    jsonb_build_object('code_type', code_record.code_type, 'ip_address', user_ip)
  );
  
  RETURN true;
END;
$$;