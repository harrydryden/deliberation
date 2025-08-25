-- Update the get_message_rating_summary function to accept user_uuid and return user_rating
CREATE OR REPLACE FUNCTION public.get_message_rating_summary(message_uuid uuid, user_uuid uuid)
 RETURNS TABLE(total_ratings bigint, helpful_count bigint, unhelpful_count bigint, user_rating integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_ratings,
    COUNT(*) FILTER (WHERE rating = 1)::BIGINT as helpful_count,
    COUNT(*) FILTER (WHERE rating = -1)::BIGINT as unhelpful_count,
    COALESCE(
      (SELECT rating FROM agent_ratings WHERE message_id = message_uuid AND user_id = user_uuid LIMIT 1),
      0
    )::INTEGER as user_rating
  FROM agent_ratings
  WHERE message_id = message_uuid;
END;
$function$