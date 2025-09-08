-- Fix critical database security issues
-- Add missing RLS policies for tables with enabled RLS but no policies

-- RLS policies for agent_interactions table
CREATE POLICY "Users can view agent interactions in their deliberations" 
ON agent_interactions FOR SELECT 
USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Admins can manage all agent interactions" 
ON agent_interactions FOR ALL 
USING (auth_is_admin());

-- RLS policies for audit_logs table  
CREATE POLICY "Admins can view all audit logs" 
ON audit_logs FOR SELECT 
USING (auth_is_admin());

CREATE POLICY "Admins can manage audit logs" 
ON audit_logs FOR ALL 
USING (auth_is_admin());

-- RLS policies for ibis_node_ratings table
CREATE POLICY "Users can view ratings in their deliberations" 
ON ibis_node_ratings FOR SELECT 
USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can create ratings in their deliberations" 
ON ibis_node_ratings FOR INSERT 
WITH CHECK (
  user_id = auth.uid() AND
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

CREATE POLICY "Users can update their own ratings" 
ON ibis_node_ratings FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all node ratings" 
ON ibis_node_ratings FOR ALL 
USING (auth_is_admin());

-- Fix search_path for missing functions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text,
  p_table_name text,
  p_record_id uuid,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO audit_logs (
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    user_id
  ) VALUES (
    p_action,
    p_table_name,
    p_record_id,
    p_old_values,
    p_new_values,
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_access_code_1()
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN 'AC1_' || encode(gen_random_bytes(8), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_access_code_2()
RETURNS character varying
LANGUAGE plpgsql  
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN 'AC2_' || encode(gen_random_bytes(8), 'hex');
END;
$$;