-- Update audit_user_deletion function to remove display_name reference
CREATE OR REPLACE FUNCTION public.audit_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Log the user deletion with profile information (no display_name)
    PERFORM audit_sensitive_operation(
        'user_deleted',
        'profiles',
        OLD.id,
        jsonb_build_object(
            'deleted_user_role', OLD.role,
            'deleted_by', get_current_access_code_user()
        )
    );
    
    RETURN OLD;
END;
$$;

-- Update handle_new_user function to remove display_name reference
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$;