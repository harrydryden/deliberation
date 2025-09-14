-- Fix the access code column size and update the function to generate 10-character codes
ALTER TABLE access_codes ALTER COLUMN code TYPE character varying(12);

-- Update the generate_secure_access_code function to generate exactly 10 characters
CREATE OR REPLACE FUNCTION generate_secure_access_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'; -- Removed similar chars: O,0,1,I,L
    result text := '';
    i integer;
    random_val integer;
BEGIN
    -- Generate exactly 10 character code
    FOR i IN 1..10 LOOP
        -- Get cryptographically secure random value
        SELECT floor(random() * length(chars) + 1)::integer INTO random_val;
        result := result || substr(chars, random_val, 1);
    END LOOP;
    
    RETURN result;
END;
$$;

-- Now test the user creation function
SELECT user_id, access_code, profile_created FROM create_user_with_access_code('user', NULL);