-- Remove unnecessary tracking columns for enhanced anonymity

-- Remove updated_at from tables where it's just audit trails (keeping it only where functionally needed)
ALTER TABLE agent_configurations DROP COLUMN IF EXISTS updated_at;
ALTER TABLE agent_knowledge DROP COLUMN IF EXISTS updated_at; 
ALTER TABLE agent_ratings DROP COLUMN IF EXISTS updated_at;
ALTER TABLE classified_items DROP COLUMN IF EXISTS updated_at;
ALTER TABLE deliberations DROP COLUMN IF EXISTS updated_at;
ALTER TABLE facilitator_sessions DROP COLUMN IF EXISTS updated_at;
ALTER TABLE file_processing_logs DROP COLUMN IF EXISTS updated_at;
ALTER TABLE ibis_nodes DROP COLUMN IF EXISTS updated_at;
ALTER TABLE ibis_node_ratings DROP COLUMN IF EXISTS updated_at;
ALTER TABLE profiles DROP COLUMN IF EXISTS updated_at;
ALTER TABLE prompt_templates DROP COLUMN IF EXISTS updated_at;
ALTER TABLE submissions DROP COLUMN IF EXISTS updated_at;
ALTER TABLE user_stance_scores DROP COLUMN IF EXISTS updated_at;

-- Remove created_at from pure tracking tables
ALTER TABLE audit_logs DROP COLUMN IF EXISTS created_at;
ALTER TABLE user_activity_logs DROP COLUMN IF EXISTS created_at;

-- Replace last_active with a simpler recently_active boolean in user_sessions
ALTER TABLE user_sessions DROP COLUMN IF EXISTS last_active;
ALTER TABLE user_sessions ADD COLUMN recently_active BOOLEAN DEFAULT true;

-- Add timestamp anonymization functions
CREATE OR REPLACE FUNCTION anonymize_timestamp_to_hour(ts TIMESTAMP WITH TIME ZONE)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
IMMUTABLE
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
AS $$
BEGIN
  -- Round timestamp to the nearest day for maximum privacy
  RETURN date_trunc('day', ts);
END;
$$;

-- Create a view for anonymized messages that rounds timestamps
CREATE OR REPLACE VIEW anonymized_messages AS
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

-- Update session service to use simplified activity tracking
CREATE OR REPLACE FUNCTION update_session_activity_simple(session_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_sessions 
  SET recently_active = true
  WHERE id = session_uuid AND is_active = true;
  
  RETURN FOUND;
END;
$$;

-- Function to mark sessions as not recently active (run periodically)
CREATE OR REPLACE FUNCTION mark_sessions_inactive()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
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