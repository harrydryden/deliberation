-- Drop all RLS policies that depend on user_id columns
DROP POLICY IF EXISTS "Users can view deliberations they participate in" ON deliberations;
DROP POLICY IF EXISTS "Users can view public deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can view all deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can create deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can delete deliberations" ON deliberations;

DROP POLICY IF EXISTS "Anyone can join as participant" ON participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON participants;

DROP POLICY IF EXISTS "Users can only view their own messages" ON messages;
DROP POLICY IF EXISTS "Users can create messages as themselves" ON messages;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles including archived" ON profiles;
DROP POLICY IF EXISTS "Users can view non-archived profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can archive profiles" ON profiles;

-- Drop dependent views
DROP VIEW IF EXISTS user_profiles_with_codes CASCADE;
DROP VIEW IF EXISTS user_profiles_with_deliberations CASCADE;
DROP VIEW IF EXISTS user_cache CASCADE;
DROP VIEW IF EXISTS notions CASCADE;

-- Now change column types
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