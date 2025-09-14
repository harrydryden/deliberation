-- Clean up remaining auth.uid() references in database functions and update them to use the access code system

-- Function to get current user from access code system
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
        AND current_setting('app.current_user_id', true) != ''
        AND current_setting('app.current_user_id', true) != 'null'
      THEN current_setting('app.current_user_id', true)::uuid
      ELSE NULL
    END;
$$;

-- Update all existing functions that reference auth.uid() to use get_current_access_code_user()

-- Update get_current_user_role function
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.profiles WHERE id = get_current_access_code_user() LIMIT 1;
$$;

-- Update is_admin_user functions
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND (role = 'admin' OR user_role = 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  );
$$;

-- Update can_user_change_role function
CREATE OR REPLACE FUNCTION public.can_user_change_role(target_user_id uuid, new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only admins can change roles
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = get_current_access_code_user() AND user_role = 'admin'
  );
END;
$$;

-- Update handle_new_user trigger function (remove since we don't use auth.users)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Update audit_sensitive_operation function
CREATE OR REPLACE FUNCTION public.audit_sensitive_operation(operation_type text, table_name text, record_id uuid DEFAULT NULL::uuid, details jsonb DEFAULT NULL::jsonb)
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
    ip_address
  ) VALUES (
    get_current_access_code_user(),
    operation_type,
    table_name,
    record_id,
    details,
    inet_client_addr()
  );
END;
$$;

-- Create RLS policies that use the access code system instead of auth.uid()

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for profiles table using access code system
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (id = get_current_access_code_user());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (id = get_current_access_code_user());

-- Enable RLS on messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create policy for messages table
CREATE POLICY "Users can view messages in their deliberations" ON public.messages
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can create their own messages" ON public.messages
  FOR INSERT WITH CHECK (user_id = get_current_access_code_user()::text);

-- Enable RLS on ibis_nodes table
ALTER TABLE public.ibis_nodes ENABLE ROW LEVEL SECURITY;

-- Create policies for ibis_nodes table
CREATE POLICY "Users can view IBIS nodes in their deliberations" ON public.ibis_nodes
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can create IBIS nodes in their deliberations" ON public.ibis_nodes
  FOR INSERT WITH CHECK (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    ) AND created_by = get_current_access_code_user()
  );

-- Enable RLS on ibis_relationships table
ALTER TABLE public.ibis_relationships ENABLE ROW LEVEL SECURITY;

-- Create policies for ibis_relationships table
CREATE POLICY "Users can view IBIS relationships in their deliberations" ON public.ibis_relationships
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can create IBIS relationships in their deliberations" ON public.ibis_relationships
  FOR INSERT WITH CHECK (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    ) AND created_by = get_current_access_code_user()
  );

-- Enable RLS on agent_knowledge table
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Create policies for agent_knowledge table
CREATE POLICY "Users can view agent knowledge they created" ON public.agent_knowledge
  FOR SELECT USING (created_by = get_current_access_code_user());

CREATE POLICY "Users can create agent knowledge" ON public.agent_knowledge
  FOR INSERT WITH CHECK (created_by = get_current_access_code_user());

CREATE POLICY "Users can delete their own agent knowledge" ON public.agent_knowledge
  FOR DELETE USING (created_by = get_current_access_code_user());

-- Admin policies for all tables
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage all messages" ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage all IBIS nodes" ON public.ibis_nodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage all IBIS relationships" ON public.ibis_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage all agent knowledge" ON public.agent_knowledge
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );