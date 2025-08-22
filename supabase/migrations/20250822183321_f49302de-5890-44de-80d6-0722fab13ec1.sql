-- Remove existing system_prompt entries from prompt_templates table
-- These will now be handled by agent configurations directly

DELETE FROM prompt_templates WHERE prompt_type = 'system_prompt';

-- Add a comment to track this migration
COMMENT ON TABLE prompt_templates IS 'Prompt templates for classification and IBIS generation. System prompts are now handled by agent configurations directly.';