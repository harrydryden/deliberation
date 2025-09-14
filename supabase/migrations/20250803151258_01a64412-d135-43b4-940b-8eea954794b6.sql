-- Fix the security definer view issue by recreating the view as a regular view
DROP VIEW IF EXISTS user_profiles_with_codes;
CREATE VIEW user_profiles_with_codes AS
SELECT 
  p.id,
  p.display_name,
  p.role as user_role,
  p.expertise_areas,
  p.created_at,
  p.updated_at,
  p.avatar_url,
  p.bio,
  ac.code as access_code,
  ac.code_type,
  ac.used_at
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id;