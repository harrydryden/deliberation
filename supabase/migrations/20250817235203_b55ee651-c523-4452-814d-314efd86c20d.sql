-- Just change the other tables, leave profiles table for now
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text;
ALTER TABLE participants ALTER COLUMN user_id TYPE text;  
ALTER TABLE messages ALTER COLUMN user_id TYPE text;
ALTER TABLE agent_configurations ALTER COLUMN created_by TYPE text;
ALTER TABLE ibis_nodes ALTER COLUMN created_by TYPE text;
ALTER TABLE ibis_relationships ALTER COLUMN created_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN used_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN created_by TYPE text;
ALTER TABLE audit_logs ALTER COLUMN user_id TYPE text;
ALTER TABLE agent_knowledge ALTER COLUMN created_by TYPE text;
ALTER TABLE user_sessions ALTER COLUMN user_id TYPE text;
ALTER TABLE facilitator_sessions ALTER COLUMN user_id TYPE text;

-- Convert UUID data to access codes where possible
UPDATE deliberations 
SET facilitator_id = (
  SELECT code FROM access_codes 
  WHERE used_by::uuid = deliberations.facilitator_id::uuid
)
WHERE facilitator_id IS NOT NULL AND facilitator_id != '';

UPDATE participants 
SET user_id = (
  SELECT code FROM access_codes 
  WHERE used_by::uuid = participants.user_id::uuid
)
WHERE user_id IS NOT NULL AND user_id != '';

-- For messages, if they contain UUIDs, convert them to access codes
UPDATE messages 
SET user_id = (
  SELECT code FROM access_codes 
  WHERE used_by::uuid = messages.user_id::uuid
)
WHERE user_id IS NOT NULL 
AND user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';