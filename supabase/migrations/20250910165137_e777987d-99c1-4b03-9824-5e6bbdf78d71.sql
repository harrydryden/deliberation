-- Clear any potential cache and force refresh of agent config
UPDATE agent_configurations 
SET updated_at = now()
WHERE name = 'Flo.' AND deliberation_id = 'dd21813f-8935-40f3-b352-55a4491dd584';