-- Add max_response_characters field to agent_configurations table
ALTER TABLE agent_configurations 
ADD COLUMN max_response_characters integer DEFAULT 800;

-- Migrate existing agents based on their response_style parsing
-- Default to 800 for most agents, 500 for flow/peer agents with existing limits
UPDATE agent_configurations 
SET max_response_characters = 500
WHERE response_style LIKE '%no more than 240%' 
   OR response_style LIKE '%no more than 500%';

-- Set higher limit for bill agents that might need more detailed responses
UPDATE agent_configurations 
SET max_response_characters = 1200
WHERE agent_type = 'bill_agent' AND max_response_characters = 800;