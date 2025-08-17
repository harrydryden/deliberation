-- First, let's just change the column types without converting data yet
-- Then we'll convert the data in a separate step

-- Change column types first
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text;
ALTER TABLE participants ALTER COLUMN user_id TYPE text;  
ALTER TABLE agent_configurations ALTER COLUMN created_by TYPE text;
ALTER TABLE ibis_nodes ALTER COLUMN created_by TYPE text;
ALTER TABLE ibis_relationships ALTER COLUMN created_by TYPE text;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE profiles ALTER COLUMN id TYPE text;
ALTER TABLE profiles ADD PRIMARY KEY (id);
ALTER TABLE profiles ALTER COLUMN archived_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN used_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN created_by TYPE text;
ALTER TABLE audit_logs ALTER COLUMN user_id TYPE text;
ALTER TABLE agent_knowledge ALTER COLUMN created_by TYPE text;
ALTER TABLE user_sessions ALTER COLUMN user_id TYPE text;
ALTER TABLE facilitator_sessions ALTER COLUMN user_id TYPE text;