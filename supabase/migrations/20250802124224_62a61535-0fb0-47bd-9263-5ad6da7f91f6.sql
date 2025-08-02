-- Create a view that properly joins users with their access codes
CREATE OR REPLACE VIEW user_profiles_with_codes AS
SELECT 
  p.id,
  p.display_name,
  p.user_role,
  p.bio,
  p.avatar_url,
  p.expertise_areas,
  p.created_at,
  p.updated_at,
  ac.code as access_code,
  ac.code_type,
  ac.used_at
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id;

-- For users without access codes, let's assign them unused access codes
-- First, let's create a function to assign access codes to users who don't have them
CREATE OR REPLACE FUNCTION assign_access_codes_to_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_record RECORD;
  available_code RECORD;
BEGIN
  -- Loop through users who don't have access codes
  FOR user_record IN 
    SELECT p.id, p.user_role 
    FROM profiles p 
    LEFT JOIN access_codes ac ON ac.used_by = p.id 
    WHERE ac.used_by IS NULL
  LOOP
    -- Find an unused access code of appropriate type
    SELECT * INTO available_code
    FROM access_codes 
    WHERE is_used = false 
      AND code_type = CASE 
        WHEN user_record.user_role = 'admin' THEN 'admin'
        ELSE 'user'
      END
    LIMIT 1;
    
    -- If we found an available code, assign it
    IF available_code.id IS NOT NULL THEN
      UPDATE access_codes 
      SET 
        is_used = true,
        used_by = user_record.id,
        used_at = now()
      WHERE id = available_code.id;
    END IF;
  END LOOP;
END;
$$;

-- Execute the function to assign access codes
SELECT assign_access_codes_to_users();

-- Add RLS policy for the view
CREATE POLICY "Users can view their own profile with code" ON user_profiles_with_codes
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles with codes" ON user_profiles_with_codes
  FOR SELECT USING (is_admin_user(auth.uid()));