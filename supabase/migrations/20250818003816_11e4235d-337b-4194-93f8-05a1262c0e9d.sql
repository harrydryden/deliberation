-- Drop all remaining triggers first
DROP TRIGGER IF EXISTS prevent_role_escalation_trigger ON profiles;
DROP TRIGGER IF EXISTS enforce_role_security ON profiles;
DROP TRIGGER IF EXISTS prevent_privilege_escalation_enhanced ON profiles;
DROP TRIGGER IF EXISTS audit_role_changes_trigger ON profiles;
DROP TRIGGER IF EXISTS audit_user_deletion_trigger ON profiles;
DROP TRIGGER IF EXISTS audit_user_archiving_trigger ON profiles;

-- Now drop the functions
DROP FUNCTION IF EXISTS prevent_role_escalation();
DROP FUNCTION IF EXISTS enforce_role_change_security();
DROP FUNCTION IF EXISTS prevent_privilege_escalation_enhanced();
DROP FUNCTION IF EXISTS audit_role_changes();
DROP FUNCTION IF EXISTS validate_role_change(uuid, text, text);
DROP FUNCTION IF EXISTS audit_user_deletion();
DROP FUNCTION IF EXISTS audit_user_archiving();

-- Disable RLS on all tables
ALTER TABLE access_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configurations DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE deliberations DISABLE ROW LEVEL SECURITY;
ALTER TABLE file_processing_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE keywords DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE security_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE simplified_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE ibis_nodes DISABLE ROW LEVEL SECURITY;
ALTER TABLE ibis_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE ibis_node_ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE classified_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE item_keywords DISABLE ROW LEVEL SECURITY;
ALTER TABLE item_relationships DISABLE ROW LEVEL SECURITY;
ALTER TABLE item_similarities DISABLE ROW LEVEL SECURITY;
ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE facilitator_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles_with_deliberations DISABLE ROW LEVEL SECURITY;