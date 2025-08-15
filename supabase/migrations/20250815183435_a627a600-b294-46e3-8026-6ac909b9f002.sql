-- Update the user_profiles_with_codes view to include archiving columns
DROP VIEW IF EXISTS user_profiles_with_codes;

CREATE VIEW user_profiles_with_codes AS
SELECT 
    p.id,
    p.created_at,
    p.updated_at,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.user_role,
    p.role,
    p.expertise_areas,
    p.is_archived,
    p.archived_at,
    p.archived_by,
    p.archive_reason,
    ac.code as access_code,
    ac.code_type,
    ac.used_at
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id;

-- Add the audit trigger to profiles table
DROP TRIGGER IF EXISTS audit_user_archiving_trigger ON public.profiles;
CREATE TRIGGER audit_user_archiving_trigger
    AFTER UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_user_archiving();