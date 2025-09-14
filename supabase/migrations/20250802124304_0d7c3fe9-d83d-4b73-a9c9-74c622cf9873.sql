-- Drop the problematic view and recreate it without SECURITY DEFINER
DROP VIEW IF EXISTS user_profiles_with_codes;

-- Create a simple view without security definer properties
CREATE VIEW user_profiles_with_codes AS
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