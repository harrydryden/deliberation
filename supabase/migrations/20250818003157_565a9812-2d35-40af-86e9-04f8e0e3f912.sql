-- Find and drop all check constraints on access_codes table
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'access_codes' 
        AND constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE access_codes DROP CONSTRAINT ' || constraint_record.constraint_name;
    END LOOP;
END $$;

-- Test our function now
SELECT user_id, access_code, profile_created FROM create_user_with_access_code('user', NULL) LIMIT 1;