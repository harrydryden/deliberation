-- Remove all RLS policies and security measures (keeping access code authentication)
-- Check existing tables first, then drop triggers, functions, and policies

-- Drop triggers first
DROP TRIGGER IF EXISTS prevent_privilege_escalation_enhanced ON profiles;
DROP TRIGGER IF EXISTS audit_role_changes_trigger ON profiles;
DROP TRIGGER IF EXISTS enforce_role_change_security_trigger ON profiles;
DROP TRIGGER IF EXISTS audit_user_deletion_trigger ON profiles;
DROP TRIGGER IF EXISTS audit_user_archiving_trigger ON profiles;
DROP TRIGGER IF EXISTS sync_user_role_with_access_code_trigger ON access_codes;

-- Now drop the security functions
DROP FUNCTION IF EXISTS prevent_privilege_escalation_enhanced() CASCADE;
DROP FUNCTION IF EXISTS audit_role_changes() CASCADE;
DROP FUNCTION IF EXISTS enforce_role_change_security() CASCADE;
DROP FUNCTION IF EXISTS prevent_role_escalation() CASCADE;
DROP FUNCTION IF EXISTS validate_role_change(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS audit_user_deletion() CASCADE;
DROP FUNCTION IF EXISTS audit_user_archiving() CASCADE;
DROP FUNCTION IF EXISTS sync_user_role_with_access_code() CASCADE;

-- Disable RLS and drop policies on existing tables only
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
ALTER TABLE simplified_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;

-- Drop all RLS policies (these will silently fail if they don't exist)
DROP POLICY IF EXISTS "Temporary admin access to access codes" ON access_codes;
DROP POLICY IF EXISTS "Anyone can read default agent configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Admin access code users can manage all knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Only admins can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can view public deliberations" ON deliberations;
DROP POLICY IF EXISTS "Users can view deliberations they participate in" ON deliberations;
DROP POLICY IF EXISTS "Admins can manage deliberations" ON deliberations;
DROP POLICY IF EXISTS "System can insert file processing logs" ON file_processing_logs;
DROP POLICY IF EXISTS "System can update file processing logs" ON file_processing_logs;
DROP POLICY IF EXISTS "System can create keywords" ON keywords;
DROP POLICY IF EXISTS "Anyone can view keywords" ON keywords;
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
DROP POLICY IF EXISTS "Users can create messages as themselves" ON messages;
DROP POLICY IF EXISTS "Anyone can join as participant" ON participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON participants;
DROP POLICY IF EXISTS "Users can view non-archived profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON profiles;
DROP POLICY IF EXISTS "System can insert events" ON simplified_events;
DROP POLICY IF EXISTS "Admin can read events" ON simplified_events;
DROP POLICY IF EXISTS "System can create sessions" ON user_sessions;