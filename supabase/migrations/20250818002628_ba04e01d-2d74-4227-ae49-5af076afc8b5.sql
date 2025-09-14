-- First recreate the missing user_profiles_with_deliberations view
CREATE OR REPLACE VIEW user_profiles_with_deliberations AS
SELECT 
  p.*,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', d.id,
          'title', d.title,
          'status', d.status,
          'role', part.role
        )
      )
      FROM participants part
      JOIN deliberations d ON d.id = part.deliberation_id
      WHERE part.user_id = p.id::text
    ),
    '[]'::json
  ) as deliberations
FROM profiles p;

-- Let's also check if we have any users in the profiles table
-- by creating a simple function to get profile count
CREATE OR REPLACE FUNCTION get_profile_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::INTEGER FROM profiles;
$$;

-- And let's check access codes count  
CREATE OR REPLACE FUNCTION get_access_code_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::INTEGER FROM access_codes;
$$;