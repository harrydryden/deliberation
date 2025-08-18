-- Create a simple 10-digit random access code generator
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
        -- Generate a random 10-digit number
        new_code := LPAD(floor(random() * 10000000000)::text, 10, '0');
        
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

-- Update the create_user_with_access_code function to use the simple generator
CREATE OR REPLACE FUNCTION public.create_user_with_access_code(p_user_role text DEFAULT 'user'::text)
RETURNS TABLE(user_id uuid, access_code text, profile_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_user_id uuid;
  new_access_code text;
  existing_unused_code record;
BEGIN
  -- Generate a new user ID
  new_user_id := gen_random_uuid();
  
  -- Try to find an unused access code of the right type
  SELECT * INTO existing_unused_code
  FROM access_codes 
  WHERE code_type = p_user_role 
    AND is_active = true 
    AND is_used = false
    AND used_by IS NULL
  LIMIT 1;
  
  IF existing_unused_code.id IS NOT NULL THEN
    -- Use existing unused code
    new_access_code := existing_unused_code.code;
    
    -- Update the access code to mark it as used
    UPDATE access_codes 
    SET 
      is_used = true,
      used_by = new_user_id,
      used_at = now(),
      current_uses = current_uses + 1
    WHERE id = existing_unused_code.id;
  ELSE
    -- Create a new access code using simple generator
    new_access_code := generate_simple_access_code();
    
    INSERT INTO access_codes (
      code,
      code_type,
      is_active,
      is_used,
      used_by,
      used_at,
      current_uses,
      max_uses
    ) VALUES (
      new_access_code,
      p_user_role,
      true,
      true,
      new_user_id,
      now(),
      1,
      1
    );
  END IF;
  
  -- Create the profile
  INSERT INTO profiles (
    id,
    role,
    user_role,
    is_archived
  ) VALUES (
    new_user_id,
    p_user_role,
    p_user_role,
    false
  );
  
  -- Return the results
  RETURN QUERY
  SELECT 
    new_user_id,
    new_access_code,
    true;
END;
$$;