-- Add facilitator configuration fields to agent_configurations table
ALTER TABLE agent_configurations 
ADD COLUMN facilitator_config JSONB DEFAULT '{}';

-- Update existing flow_agent configurations with default facilitator settings
UPDATE agent_configurations 
SET facilitator_config = '{
  "prompting_enabled": true,
  "prompting_interval_minutes": 3,
  "max_prompts_per_session": 5,
  "prompting_questions": [
    {
      "id": "engagement_1",
      "text": "What aspects of this topic would you like to explore further?",
      "category": "exploration",
      "weight": 1.0
    },
    {
      "id": "perspective_1", 
      "text": "Are there different perspectives on this issue that we should consider?",
      "category": "perspective",
      "weight": 1.0
    },
    {
      "id": "clarification_1",
      "text": "Could you help clarify any points that might benefit from more detail?",
      "category": "clarification", 
      "weight": 1.0
    },
    {
      "id": "synthesis_1",
      "text": "How do these different viewpoints connect or conflict with each other?",
      "category": "synthesis",
      "weight": 1.0
    },
    {
      "id": "action_1",
      "text": "What practical next steps or actions might emerge from this discussion?",
      "category": "action",
      "weight": 1.0
    }
  ]
}'
WHERE agent_type = 'flow_agent';

-- Create an index for better performance when querying facilitator configs
CREATE INDEX idx_agent_configurations_facilitator_config 
ON agent_configurations USING GIN (facilitator_config);

-- Add a table to track facilitator prompting state per session
CREATE TABLE facilitator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  deliberation_id UUID,
  agent_config_id UUID NOT NULL REFERENCES agent_configurations(id),
  last_prompt_time TIMESTAMP WITH TIME ZONE,
  prompts_sent_count INTEGER DEFAULT 0,
  last_activity_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_state JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_facilitator_sessions_user_id ON facilitator_sessions(user_id);
CREATE INDEX idx_facilitator_sessions_deliberation_id ON facilitator_sessions(deliberation_id);
CREATE INDEX idx_facilitator_sessions_last_activity ON facilitator_sessions(last_activity_time);

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_facilitator_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_facilitator_sessions_updated_at
  BEFORE UPDATE ON facilitator_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_facilitator_sessions_updated_at();