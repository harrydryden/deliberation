-- Find all views with SECURITY DEFINER
SELECT schemaname, viewname 
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname IN (
  SELECT viewname 
  FROM pg_views v
  JOIN pg_class c ON c.relname = v.viewname 
  WHERE c.relkind = 'v'
);

-- Drop and recreate the user_cache view with SECURITY INVOKER
DROP VIEW IF EXISTS public.user_cache;

CREATE VIEW public.user_cache 
WITH (security_invoker=on) AS
SELECT 
  id,
  display_name,
  user_role,
  expertise_areas,
  COALESCE(
    (SELECT array_agg(participants.deliberation_id) 
     FROM participants
     WHERE participants.user_id = p.id), 
    ARRAY[]::uuid[]
  ) AS deliberation_ids
FROM profiles p;

-- Check if there's a notions view that also needs fixing
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'notions';