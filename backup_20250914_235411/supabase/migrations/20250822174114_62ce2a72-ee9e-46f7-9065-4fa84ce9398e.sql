-- Move existing system_prompt values to prompt_templates before removing the column
DO $$
DECLARE
    agent_record RECORD;
BEGIN
    -- First, create default prompt templates for each agent type if they don't exist
    INSERT INTO prompt_templates (prompt_type, agent_type, name, template, description, is_default, is_active, created_by)
    SELECT DISTINCT 
        'system_prompt',
        ac.agent_type,
        'Default ' || ac.agent_type || ' System Prompt',
        COALESCE(ac.system_prompt, 'You are a helpful AI assistant in a deliberation process.'),
        'Default system prompt for ' || ac.agent_type || ' agents',
        true,
        true,
        ac.created_by
    FROM agent_configurations ac
    WHERE ac.agent_type IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM prompt_templates pt 
        WHERE pt.prompt_type = 'system_prompt' 
        AND pt.agent_type = ac.agent_type 
        AND pt.is_default = true
    );

    -- For any custom system_prompts that differ from defaults, create agent-specific overrides
    FOR agent_record IN 
        SELECT ac.id, ac.system_prompt, ac.agent_type
        FROM agent_configurations ac
        WHERE ac.system_prompt IS NOT NULL 
        AND ac.system_prompt != 'You are a helpful AI assistant in a deliberation process.'
        AND NOT EXISTS (
            SELECT 1 FROM prompt_templates pt 
            WHERE pt.prompt_type = 'system_prompt' 
            AND pt.agent_type = ac.agent_type 
            AND pt.template = ac.system_prompt
        )
    LOOP
        -- Update agent's prompt_overrides to include the custom system prompt
        UPDATE agent_configurations 
        SET prompt_overrides = COALESCE(prompt_overrides, '{}'::jsonb) || 
            jsonb_build_object('system_prompt', agent_record.system_prompt)
        WHERE id = agent_record.id;
    END LOOP;
END $$;

-- Now remove the system_prompt column from agent_configurations
ALTER TABLE agent_configurations DROP COLUMN IF EXISTS system_prompt;