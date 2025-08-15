-- Drop the existing view first
DROP VIEW IF EXISTS public.user_profiles_with_deliberations;

-- Create a safer view without security definer
CREATE VIEW public.user_profiles_with_deliberations AS
SELECT 
  p.*,
  ac.code AS access_code,
  ac.code_type,
  ac.used_at,
  COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'id', d.id,
        'title', d.title,
        'role', part.role
      )
    ) FILTER (WHERE d.id IS NOT NULL),
    '[]'::json
  ) AS deliberations
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id
LEFT JOIN participants part ON part.user_id = p.id
LEFT JOIN deliberations d ON d.id = part.deliberation_id
GROUP BY p.id, p.created_at, p.updated_at, p.display_name, p.bio, p.avatar_url, 
         p.user_role, p.role, p.expertise_areas, p.is_archived, p.archived_at, 
         p.archived_by, p.archive_reason, ac.code, ac.code_type, ac.used_at;