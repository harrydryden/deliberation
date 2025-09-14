-- Create functions to work with access code system
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- This would need to be set by the application when making requests
  -- For now, return a placeholder that indicates access code auth
  SELECT current_setting('app.current_user_id', true);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_access_code_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if current user has admin access code
  SELECT EXISTS (
    SELECT 1 FROM access_codes ac
    WHERE ac.code_type = 'admin' 
    AND ac.is_active = true
    AND ac.is_used = true
    AND ac.used_by::text = current_setting('app.current_user_id', true)
  );
$$;

-- Update RLS policies to use access code functions
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (is_admin_access_code_user());

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;  
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (id::text = get_current_access_code_user());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles  
FOR UPDATE
USING (id::text = get_current_access_code_user());

-- Fix admin access to access codes
DROP POLICY IF EXISTS "Only admins can view access codes" ON public.access_codes;
CREATE POLICY "Only admins can view access codes"
ON public.access_codes
FOR SELECT  
USING (is_admin_access_code_user());

DROP POLICY IF EXISTS "Admins can manage access codes" ON public.access_codes;
CREATE POLICY "Admins can manage access codes"
ON public.access_codes
FOR ALL
USING (is_admin_access_code_user());

-- Fix message creation security
DROP POLICY IF EXISTS "Allow message creation with valid user_id" ON public.messages;
CREATE POLICY "Allow message creation with valid user_id"
ON public.messages
FOR INSERT
WITH CHECK (
  user_id IS NOT NULL 
  AND length(user_id) > 0 
  AND user_id = get_current_access_code_user()
);