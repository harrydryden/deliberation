-- Security Hardening Phase 1: Fix function search path vulnerabilities

-- Fix search paths for all functions missing SET search_path = 'public'
CREATE OR REPLACE FUNCTION public.get_user_deliberations(user_uuid uuid)
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = user_uuid::text;
$$;

CREATE OR REPLACE FUNCTION public.is_participant_in_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = $1 
    AND participants.user_id = $2::text
  );
$$;

CREATE OR REPLACE FUNCTION public.get_deliberation_stance_summary(deliberation_uuid uuid)
RETURNS TABLE(total_users bigint, average_stance numeric, positive_users bigint, negative_users bigint, neutral_users bigint, average_confidence numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_users,
    AVG(stance_score)::DECIMAL(3,2) as average_stance,
    COUNT(CASE WHEN stance_score > 0.1 THEN 1 END)::BIGINT as positive_users,
    COUNT(CASE WHEN stance_score < -0.1 THEN 1 END)::BIGINT as negative_users,
    COUNT(CASE WHEN stance_score >= -0.1 AND stance_score <= 0.1 THEN 1 END)::BIGINT as neutral_users,
    AVG(confidence_score)::DECIMAL(3,2) as average_confidence
  FROM user_stance_scores
  WHERE deliberation_id = deliberation_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_stance_trend(user_uuid uuid, deliberation_uuid uuid)
RETURNS TABLE(date date, stance_score numeric, confidence_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(updated_at) as date,
    stance_score,
    confidence_score
  FROM user_stance_scores
  WHERE user_id = user_uuid AND deliberation_id = deliberation_uuid
  ORDER BY updated_at DESC;
END;
$$;