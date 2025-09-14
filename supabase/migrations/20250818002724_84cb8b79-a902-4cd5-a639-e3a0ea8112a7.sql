-- Drop and recreate the view with correct columns
DROP VIEW IF EXISTS user_profiles_with_deliberations;

CREATE VIEW user_profiles_with_deliberations AS
SELECT 
  p.id,
  p.role,
  p.user_role,
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

-- Now test the user creation function
SELECT user_id, access_code, profile_created FROM create_user_with_access_code('user', 'Test User');