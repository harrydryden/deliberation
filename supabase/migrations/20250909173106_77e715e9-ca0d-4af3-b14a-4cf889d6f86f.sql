-- Create the get_message_rating_summary function
CREATE OR REPLACE FUNCTION get_message_rating_summary(message_uuid uuid, user_uuid uuid)
RETURNS TABLE (
  helpful_count bigint,
  unhelpful_count bigint,
  total_ratings bigint,
  user_rating integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0)::bigint AS helpful_count,
    COALESCE(SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END), 0)::bigint AS unhelpful_count,
    COALESCE(COUNT(*), 0)::bigint AS total_ratings,
    COALESCE(
      (SELECT rating FROM agent_ratings WHERE message_id = message_uuid AND user_id = user_uuid LIMIT 1),
      0
    )::integer AS user_rating
  FROM agent_ratings
  WHERE message_id = message_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;