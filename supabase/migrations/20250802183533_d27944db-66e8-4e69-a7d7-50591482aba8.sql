-- Add foreign key constraint for agent_configurations.deliberation_id
ALTER TABLE agent_configurations 
ADD CONSTRAINT agent_configurations_deliberation_id_fkey 
FOREIGN KEY (deliberation_id) REFERENCES deliberations(id) ON DELETE CASCADE;

-- Add foreign key constraint for agent_configurations.created_by
ALTER TABLE agent_configurations 
ADD CONSTRAINT agent_configurations_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;