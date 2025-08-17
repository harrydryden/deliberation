-- Drop views that depend on user_id columns so we can alter the column types
DROP VIEW IF EXISTS user_profiles_with_deliberations;
DROP VIEW IF EXISTS user_profiles_with_codes;  
DROP VIEW IF EXISTS user_cache;
DROP VIEW IF EXISTS notions;

-- Now change column types from UUID to TEXT to support access_ format
-- Update participants table
ALTER TABLE participants 
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Update deliberations table  
ALTER TABLE deliberations
ALTER COLUMN facilitator_id TYPE TEXT USING facilitator_id::TEXT;

-- Update ibis_nodes table
ALTER TABLE ibis_nodes
ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;

-- Update ibis_relationships table
ALTER TABLE ibis_relationships  
ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;

-- Update ibis_node_ratings table
ALTER TABLE ibis_node_ratings
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Update submissions table
ALTER TABLE submissions
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Update classified_items table
ALTER TABLE classified_items
ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;

-- Update facilitator_sessions table
ALTER TABLE facilitator_sessions
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Update user_sessions table
ALTER TABLE user_sessions
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Update file_processing_logs table  
ALTER TABLE file_processing_logs
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;