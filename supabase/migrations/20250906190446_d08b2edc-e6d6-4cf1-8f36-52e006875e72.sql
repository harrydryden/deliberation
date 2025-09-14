-- Remove privacy-invasive tracking fields to enhance user anonymity

-- 1. Remove user_agent and ip_address from user_sessions table
ALTER TABLE user_sessions 
DROP COLUMN IF EXISTS user_agent,
DROP COLUMN IF EXISTS ip_address;

-- 2. Remove ip_address and user_agent from audit_logs table (if they exist)
ALTER TABLE audit_logs 
DROP COLUMN IF EXISTS user_agent,
DROP COLUMN IF EXISTS ip_address;

-- 3. Add function to anonymize session tokens periodically
CREATE OR REPLACE FUNCTION anonymize_old_sessions()
RETURNS void AS $$
BEGIN
  -- Clear session token hashes older than 30 days for anonymity
  UPDATE user_sessions 
  SET session_token_hash = 'anonymized'
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND session_token_hash != 'anonymized'
  AND is_active = false;
END;
$$ LANGUAGE plpgsql;

-- 4. Create minimal session tracking that only stores what's functionally necessary
COMMENT ON TABLE user_sessions IS 'Minimal session tracking for security without privacy invasion';
COMMENT ON COLUMN user_sessions.session_token_hash IS 'Anonymized after 30 days for privacy';

-- 5. Remove detailed audit functions that track too much user data
DROP FUNCTION IF EXISTS enhanced_audit_log(text, text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS audit_sensitive_operation(text, text, uuid, jsonb);

-- 6. Create simplified audit function that only logs essential security events
CREATE OR REPLACE FUNCTION log_security_event(event_type text, details jsonb DEFAULT '{}'::jsonb)
RETURNS void AS $$
BEGIN
  INSERT INTO simplified_events (event_type, details, created_at)
  VALUES (event_type, details, NOW());
END;
$$ LANGUAGE plpgsql;

-- 7. Schedule regular anonymization (this would typically be set up as a cron job)
-- For now, we'll just create the function - actual scheduling would be done externally