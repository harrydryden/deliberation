-- Remove privacy-invasive tracking fields to enhance user anonymity

-- 1. Remove user_agent and ip_address from user_sessions table
ALTER TABLE user_sessions 
DROP COLUMN IF EXISTS user_agent,
DROP COLUMN IF EXISTS ip_address;

-- 2. Remove user_agent and ip_address from login_attempts table 
ALTER TABLE login_attempts 
DROP COLUMN IF EXISTS user_agent,
DROP COLUMN IF EXISTS ip_address;

-- 3. Remove unnecessary created_at from tables where it's not functionally required
-- Keep created_at only where essential for business logic (messages, deliberations, etc.)
-- Remove from tracking/audit tables where it's just surveillance

-- 4. Add function to anonymize session tokens periodically
CREATE OR REPLACE FUNCTION anonymize_old_sessions()
RETURNS void AS $$
BEGIN
  -- Clear session token hashes older than 30 days
  UPDATE user_sessions 
  SET session_token_hash = 'anonymized'
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND session_token_hash != 'anonymized';
END;
$$ LANGUAGE plpgsql;

-- 5. Create minimal session tracking that only stores what's functionally necessary
-- Update user_sessions to remove excessive tracking while keeping core functionality
COMMENT ON TABLE user_sessions IS 'Minimal session tracking for security without privacy invasion';
COMMENT ON COLUMN user_sessions.session_token_hash IS 'Anonymized after 30 days for privacy';

-- 6. Remove detailed timing from login attempts - keep only basic rate limiting info
-- If login_attempts has detailed timestamps beyond what's needed for rate limiting, simplify
UPDATE login_attempts 
SET attempted_at = DATE_TRUNC('hour', attempted_at)
WHERE attempted_at < NOW() - INTERVAL '1 day';

-- 7. Schedule regular anonymization
-- This would typically be set up as a cron job or scheduled function