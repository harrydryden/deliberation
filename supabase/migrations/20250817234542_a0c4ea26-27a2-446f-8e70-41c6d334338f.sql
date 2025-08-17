-- First migration: Drop foreign key constraints and convert data
-- We'll need to convert the UUID data to access codes and drop constraints

-- Drop foreign key constraints that would block the column type changes
ALTER TABLE deliberations DROP CONSTRAINT IF EXISTS deliberations_facilitator_id_fkey;
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_user_id_fkey;
ALTER TABLE agent_configurations DROP CONSTRAINT IF EXISTS agent_configurations_created_by_fkey;
ALTER TABLE ibis_nodes DROP CONSTRAINT IF EXISTS ibis_nodes_created_by_fkey;
ALTER TABLE ibis_relationships DROP CONSTRAINT IF EXISTS ibis_relationships_created_by_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_archived_by_fkey;
ALTER TABLE access_codes DROP CONSTRAINT IF EXISTS access_codes_used_by_fkey;
ALTER TABLE access_codes DROP CONSTRAINT IF EXISTS access_codes_created_by_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE agent_knowledge DROP CONSTRAINT IF EXISTS agent_knowledge_created_by_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE facilitator_sessions DROP CONSTRAINT IF EXISTS facilitator_sessions_user_id_fkey;

-- Convert UUID data to access codes in all tables
-- Update deliberations facilitator_id from UUID to access code
UPDATE deliberations 
SET facilitator_id = (
  SELECT code FROM access_codes 
  WHERE used_by::text = deliberations.facilitator_id
)
WHERE facilitator_id IS NOT NULL;

-- Update participants user_id from UUID to access code  
UPDATE participants 
SET user_id = (
  SELECT code FROM access_codes 
  WHERE used_by::text = participants.user_id
)
WHERE user_id IS NOT NULL;

-- Update agent_configurations created_by from UUID to access code
UPDATE agent_configurations 
SET created_by = (
  SELECT code FROM access_codes 
  WHERE used_by::text = agent_configurations.created_by
)
WHERE created_by IS NOT NULL;

-- Update ibis_nodes created_by from UUID to access code
UPDATE ibis_nodes 
SET created_by = (
  SELECT code FROM access_codes 
  WHERE used_by::text = ibis_nodes.created_by
)
WHERE created_by IS NOT NULL;

-- Update ibis_relationships created_by from UUID to access code
UPDATE ibis_relationships 
SET created_by = (
  SELECT code FROM access_codes 
  WHERE used_by::text = ibis_relationships.created_by
)
WHERE created_by IS NOT NULL;

-- Update profiles id from UUID to access code and other fields
UPDATE profiles 
SET id = (
  SELECT code FROM access_codes 
  WHERE used_by::text = profiles.id
)
WHERE EXISTS (
  SELECT 1 FROM access_codes 
  WHERE used_by::text = profiles.id
);

-- Update profiles archived_by from UUID to access code
UPDATE profiles 
SET archived_by = (
  SELECT code FROM access_codes 
  WHERE used_by::text = profiles.archived_by
)
WHERE archived_by IS NOT NULL;