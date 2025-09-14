-- Create the missing user_profiles_with_deliberations view with proper type casting
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