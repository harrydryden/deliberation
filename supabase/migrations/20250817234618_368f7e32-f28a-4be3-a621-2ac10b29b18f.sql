-- Step 1: Drop ALL foreign key constraints first
ALTER TABLE deliberations DROP CONSTRAINT IF EXISTS deliberations_facilitator_id_fkey;
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_user_id_fkey;
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_deliberation_id_fkey;
ALTER TABLE agent_configurations DROP CONSTRAINT IF EXISTS agent_configurations_created_by_fkey;
ALTER TABLE agent_configurations DROP CONSTRAINT IF EXISTS agent_configurations_deliberation_id_fkey;
ALTER TABLE ibis_nodes DROP CONSTRAINT IF EXISTS ibis_nodes_created_by_fkey;
ALTER TABLE ibis_nodes DROP CONSTRAINT IF EXISTS ibis_nodes_deliberation_id_fkey;
ALTER TABLE ibis_relationships DROP CONSTRAINT IF EXISTS ibis_relationships_created_by_fkey;
ALTER TABLE ibis_relationships DROP CONSTRAINT IF EXISTS ibis_relationships_deliberation_id_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_archived_by_fkey;
ALTER TABLE access_codes DROP CONSTRAINT IF EXISTS access_codes_used_by_fkey;
ALTER TABLE access_codes DROP CONSTRAINT IF EXISTS access_codes_created_by_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE agent_knowledge DROP CONSTRAINT IF EXISTS agent_knowledge_created_by_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE facilitator_sessions DROP CONSTRAINT IF EXISTS facilitator_sessions_user_id_fkey;
ALTER TABLE facilitator_sessions DROP CONSTRAINT IF EXISTS facilitator_sessions_deliberation_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_deliberation_id_fkey;

-- Drop any other constraints that might exist
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;