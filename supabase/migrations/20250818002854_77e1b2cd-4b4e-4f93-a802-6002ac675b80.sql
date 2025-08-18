-- Drop the digits-only constraint and update the function to generate numeric codes
ALTER TABLE access_codes DROP CONSTRAINT IF EXISTS access_codes_digits_only;

-- Update the function to generate numeric-only codes
CREATE OR REPLACE FUNCTION generate_secure_access_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    result text := '';
    i integer;
    random_val integer;
BEGIN
    -- Generate exactly 10 digit code
    FOR i IN 1..10 LOOP
        -- Get random digit 0-9
        SELECT floor(random() * 10)::integer INTO random_val;
        result := result || random_val::text;
    END LOOP;
    
    RETURN result;
END;
$$;

-- Test the user creation function again
SELECT user_id, access_code, profile_created FROM create_user_with_access_code('user', NULL);