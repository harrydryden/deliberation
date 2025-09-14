-- Create the missing view for user profiles with deliberations and access codes
CREATE OR REPLACE VIEW user_profiles_with_deliberations_with_codes AS
SELECT 
  p.id,
  p.created_at,
  p.updated_at,
  p.is_archived,
  p.archived_at,
  p.archived_by,
  p.archive_reason,
  p.migrated_from_access_code,
  ur.role as user_role,
  ac.code as access_code,
  COALESCE(
    json_agg(
      CASE 
        WHEN d.id IS NOT NULL THEN 
          json_build_object(
            'id', d.id,
            'title', d.title,
            'status', d.status,
            'created_at', d.created_at
          )
      END
    ) FILTER (WHERE d.id IS NOT NULL), 
    '[]'::json
  ) as deliberations
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
LEFT JOIN access_codes ac ON p.id = ac.used_by
LEFT JOIN participants pt ON p.id::text = pt.user_id
LEFT JOIN deliberations d ON pt.deliberation_id = d.id
GROUP BY p.id, p.created_at, p.updated_at, p.is_archived, p.archived_at, p.archived_by, p.archive_reason, p.migrated_from_access_code, ur.role, ac.code;