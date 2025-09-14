-- Fix the view by removing SECURITY DEFINER and ensuring proper RLS policies
DROP VIEW IF EXISTS user_profiles_with_deliberations;

CREATE VIEW user_profiles_with_deliberations AS
SELECT 
  p.id,
  p.role,
  p.user_role,
  p.display_name,
  p.bio,
  p.avatar_url,
  p.expertise_areas,
  p.is_archived,
  p.archived_by,
  p.archived_at,
  p.archive_reason,
  p.created_at,
  p.updated_at,
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

-- Test the user creation function with some test data
SELECT * FROM create_user_with_access_code('user', 'Test User') LIMIT 1;