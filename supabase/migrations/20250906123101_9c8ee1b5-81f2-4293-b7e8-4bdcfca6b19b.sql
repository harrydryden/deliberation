-- Fix facilitator_sessions foreign key constraint issue
-- Add proper error handling for missing agent configurations

-- First, check if there are any orphaned facilitator_sessions
DO $$
DECLARE
    orphaned_count INTEGER;
BEGIN
    -- Count orphaned sessions
    SELECT COUNT(*) INTO orphaned_count
    FROM facilitator_sessions fs
    LEFT JOIN agent_configurations ac ON fs.agent_config_id = ac.id
    WHERE ac.id IS NULL;
    
    IF orphaned_count > 0 THEN
        -- Delete orphaned sessions to fix constraint violations
        DELETE FROM facilitator_sessions 
        WHERE agent_config_id NOT IN (
            SELECT id FROM agent_configurations WHERE id IS NOT NULL
        );
        
        RAISE NOTICE 'Removed % orphaned facilitator sessions', orphaned_count;
    END IF;
END $$;

-- Add a function to ensure agent configs exist before creating sessions
CREATE OR REPLACE FUNCTION ensure_agent_config_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the agent_config_id exists
    IF NOT EXISTS (
        SELECT 1 FROM agent_configurations 
        WHERE id = NEW.agent_config_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Agent configuration % does not exist or is inactive', NEW.agent_config_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to validate agent config exists before session creation
DROP TRIGGER IF EXISTS validate_agent_config_before_session ON facilitator_sessions;
CREATE TRIGGER validate_agent_config_before_session
    BEFORE INSERT OR UPDATE ON facilitator_sessions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_agent_config_exists();

-- Add preferred_model column to agent_configurations for model selection
ALTER TABLE agent_configurations 
ADD COLUMN IF NOT EXISTS preferred_model text;

-- Add comment explaining the preferred_model column
COMMENT ON COLUMN agent_configurations.preferred_model IS 'Preferred AI model for this agent (e.g., gpt-5-2025-08-07, gpt-5-mini-2025-08-07)';

-- Create an index on agent_type and deliberation_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_configurations_lookup 
ON agent_configurations (agent_type, deliberation_id, is_active);

-- Create an index on facilitator_sessions for faster cleanup
CREATE INDEX IF NOT EXISTS idx_facilitator_sessions_agent_config 
ON facilitator_sessions (agent_config_id, user_id);

-- Create a function to clean up orphaned data
CREATE OR REPLACE FUNCTION cleanup_orphaned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete sessions with invalid agent configs
    DELETE FROM facilitator_sessions 
    WHERE agent_config_id NOT IN (
        SELECT id FROM agent_configurations WHERE id IS NOT NULL
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- Log the fix completion
DO $$
BEGIN
    RAISE NOTICE 'Agent configuration constraint fixes applied successfully';
END $$;