-- Move IBIS facilitation functionality from Pia (peer_agent) to Flo (flow_agent)

-- First, let's get any existing IBIS configurations from Pia agents
-- and prepare to move them to Flo agents

-- Update existing Pia agents to remove IBIS facilitation config
UPDATE agent_configurations 
SET facilitator_config = jsonb_set(
    COALESCE(facilitator_config, '{}'::jsonb),
    '{ibis_facilitation}',
    jsonb_build_object(
        'enabled', false,
        'share_issue_prompt', '',
        'share_position_prompt', '',
        'share_argument_prompt', ''
    )
)
WHERE agent_type = 'peer_agent' 
AND (name = 'Pia' OR name ILIKE '%pia%');

-- Update existing Flo agents to add IBIS facilitation config
UPDATE agent_configurations 
SET facilitator_config = jsonb_set(
    COALESCE(facilitator_config, '{}'::jsonb),
    '{ibis_facilitation}',
    jsonb_build_object(
        'enabled', true,
        'share_issue_prompt', 'Based on the existing discussion, here are the key issues other participants have identified. Which of these resonates with your perspective?',
        'share_position_prompt', 'Other participants have taken various positions on this issue. Here are the main viewpoints that have been shared. Do any of these align with your thinking?',
        'share_argument_prompt', 'Here are the arguments other participants have made supporting different positions. Which of these do you find most compelling, or would you like to hear more about any particular argument?'
    )
)
WHERE agent_type = 'flow_agent' 
AND (name = 'Flo' OR name ILIKE '%flo%');

-- Log this migration action
INSERT INTO audit_logs (action, table_name, record_id, new_values, user_id)
VALUES (
    'ibis_facilitation_migration',
    'agent_configurations', 
    NULL,
    jsonb_build_object(
        'migration', 'move_ibis_from_pia_to_flo',
        'timestamp', now(),
        'description', 'Moved IBIS facilitation functionality from peer agent (Pia) to flow agent (Flo)'
    ),
    NULL
);