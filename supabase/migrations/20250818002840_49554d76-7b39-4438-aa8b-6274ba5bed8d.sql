-- Fix the create_user_with_access_code function to not use display_name
CREATE OR REPLACE FUNCTION create_user_with_access_code(
  p_user_role text DEFAULT 'user',
  p_display_name text DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  access_code text,
  profile_created boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
    -- Create a new access code
    new_access_code := generate_secure_access_code();
    
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
  
  -- Create the profile with only the columns that exist
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

-- Test the user creation function
SELECT user_id, access_code, profile_created FROM create_user_with_access_code('user', NULL);