-- Fix the notions view with SECURITY INVOKER
DROP VIEW IF EXISTS public.notions;

CREATE VIEW public.notions 
WITH (security_invoker=on) AS
SELECT 
  ci.id,
  ci.submission_id,
  ci.deliberation_id,
  ci.item_type,
  ci.headline,
  ci.full_content,
  ci.stance_score,
  ci.confidence_score,
  ci.ai_generated,
  ci.user_edited,
  ci.status,
  ci.created_by,
  ci.created_at,
  ci.updated_at,
  s.raw_content,
  s.message_id,
  s.user_id AS submitter_id,
  array_agg(DISTINCT k.keyword) FILTER (WHERE k.keyword IS NOT NULL) AS keywords,
  count(DISTINCT ir_out.id) AS outgoing_relationships,
  count(DISTINCT ir_in.id) AS incoming_relationships
FROM classified_items ci
JOIN submissions s ON ci.submission_id = s.id
LEFT JOIN item_keywords ik ON ci.id = ik.classified_item_id
LEFT JOIN keywords k ON ik.keyword_id = k.id
LEFT JOIN item_relationships ir_out ON ci.id = ir_out.source_item_id
LEFT JOIN item_relationships ir_in ON ci.id = ir_in.target_item_id
GROUP BY ci.id, s.id;

-- Fix the remaining function with mutable search path
CREATE OR REPLACE FUNCTION public.is_facilitator_of_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM deliberations 
    WHERE deliberations.id = $1 
    AND deliberations.facilitator_id = $2
  );
$$;