-- Add foreign key relationship between profiles and access_codes tables
-- This will allow us to join the tables to get access code information with user profiles

-- First, let's create an index on access_codes.used_by for better performance
CREATE INDEX IF NOT EXISTS idx_access_codes_used_by ON public.access_codes(used_by);

-- Add foreign key constraint from access_codes to profiles
-- Note: We can't add a foreign key constraint from profiles to access_codes because 
-- profiles.id is the primary key and access_codes.used_by references it
-- The relationship is already established via access_codes.used_by -> profiles.id

-- Update the user_profiles_with_deliberations view to include access codes
CREATE OR REPLACE VIEW public.user_profiles_with_deliberations_with_codes AS
SELECT 
    p.id,
    p.created_at,
    p.updated_at,
    p.user_role,
    p.role,
    p.is_archived,
    p.archived_at,
    p.archived_by,
    p.archive_reason,
    ac.code as access_code,
    COALESCE(( 
        SELECT json_agg(json_build_object('id', d.id, 'title', d.title, 'status', d.status, 'role', part.role)) 
        FROM (participants part JOIN deliberations d ON ((d.id = part.deliberation_id)))
        WHERE (part.user_id = (p.id)::text)
    ), '[]'::json) AS deliberations
FROM profiles p
LEFT JOIN access_codes ac ON ac.used_by = p.id;