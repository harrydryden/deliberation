-- Fix the access code generator to ensure exactly 10 digits
CREATE OR REPLACE FUNCTION public.generate_simple_access_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    new_code text;
    code_exists boolean;
BEGIN
    LOOP
        -- Generate exactly 10 random digits (0000000000 to 9999999999)
        new_code := LPAD(floor(random() * 9999999999 + 1)::text, 10, '0');
        
        -- Ensure it's exactly 10 characters
        new_code := SUBSTRING(new_code, 1, 10);
        
        -- Check if this code already exists
        SELECT EXISTS(SELECT 1 FROM access_codes WHERE code = new_code) INTO code_exists;
        
        -- If code doesn't exist, we can use it
        IF NOT code_exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN new_code;
END;
$$;