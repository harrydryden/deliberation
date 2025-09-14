-- Add delete policy for admin users on profiles table
CREATE POLICY "Admins can delete user profiles" 
ON public.profiles 
FOR DELETE 
USING (get_current_user_role() = 'admin');

-- Also add enhanced audit logging for user deletions
CREATE OR REPLACE FUNCTION public.audit_user_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Log the user deletion with all profile information
    PERFORM audit_sensitive_operation(
        'user_deleted',
        'profiles',
        OLD.id,
        jsonb_build_object(
            'deleted_user_role', OLD.role,
            'deleted_display_name', OLD.display_name,
            'deleted_by', auth.uid()
        )
    );
    
    RETURN OLD;
END;
$function$;

-- Create trigger for user deletion auditing
CREATE TRIGGER audit_user_deletion_trigger
    BEFORE DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_user_deletion();