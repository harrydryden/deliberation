-- Remove old default system prompts that are no longer used
DELETE FROM prompt_templates 
WHERE name IN (
  'Default Bill Agent System Prompt',
  'Default Flow Agent System Prompt', 
  'Default Peer Agent System Prompt'
);