-- Fix security issue with anonymized_messages view
-- Remove SECURITY DEFINER and make it a regular view with proper RLS

DROP VIEW IF EXISTS anonymized_messages;

-- Create regular view without SECURITY DEFINER
CREATE VIEW anonymized_messages AS
SELECT 
  id,
  content,
  message_type,
  user_id,
  deliberation_id,
  parent_message_id,
  submitted_to_ibis,
  agent_context,
  anonymize_timestamp_to_hour(created_at) as created_at_hourly,
  anonymize_timestamp_to_day(created_at) as created_at_daily
FROM messages;

-- Add proper search path to the anonymization functions
CREATE OR REPLACE FUNCTION anonymize_timestamp_to_hour(ts TIMESTAMP WITH TIME ZONE)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Round timestamp to the nearest hour for privacy
  RETURN date_trunc('hour', ts);
END;
$$;

CREATE OR REPLACE FUNCTION anonymize_timestamp_to_day(ts TIMESTAMP WITH TIME ZONE)
RETURNS TIMESTAMP WITH TIME ZONE  
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Round timestamp to the nearest day for maximum privacy
  RETURN date_trunc('day', ts);
END;
$$;

CREATE OR REPLACE FUNCTION update_session_activity_simple(session_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_sessions 
  SET recently_active = true
  WHERE id = session_uuid AND is_active = true;
  
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION mark_sessions_inactive()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Mark sessions as not recently active after 1 hour of no updates
  UPDATE user_sessions 
  SET recently_active = false
  WHERE recently_active = true 
    AND expires_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;