-- Create access codes for existing users who don't have them
DO $$
DECLARE
    user_record RECORD;
    new_access_code TEXT;
    user_role_type TEXT;
BEGIN
    -- Loop through all users who don't have access codes
    FOR user_record IN 
        SELECT p.id, COALESCE(ur.role::text, 'user') as user_role
        FROM profiles p
        LEFT JOIN user_roles ur ON p.id = ur.user_id
        LEFT JOIN access_codes ac ON p.id = ac.used_by
        WHERE ac.used_by IS NULL
    LOOP
        -- Generate a simple access code
        new_access_code := generate_simple_access_code();
        
        -- Insert the access code
        INSERT INTO access_codes (
            code,
            code_type,
            is_active,
            is_used,
            used_by,
            used_at,
            current_uses
        ) VALUES (
            new_access_code,
            user_record.user_role,
            true,
            true,
            user_record.id,
            now(),
            1
        );
        
        RAISE NOTICE 'Created access code % for user % with role %', 
                     new_access_code, user_record.id, user_record.user_role;
    END LOOP;
END $$;