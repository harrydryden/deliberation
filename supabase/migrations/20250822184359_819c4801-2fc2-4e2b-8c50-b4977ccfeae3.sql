-- Fix the log_admin_action function to use auth.uid() instead of get_current_access_code_user()
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