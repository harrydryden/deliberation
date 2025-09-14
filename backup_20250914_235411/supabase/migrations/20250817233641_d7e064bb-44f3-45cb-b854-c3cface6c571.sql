-- Migration to convert all UUID-based user references to access_ format
-- This will update all existing data to use the new access_ format

-- First, update participants table to use access_ format
UPDATE participants 
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE participants.user_id = ac.used_by
AND ac.is_used = true;

-- Update messages table to use access_ format  
UPDATE messages 
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE messages.user_id = ac.used_by::text
AND ac.is_used = true;

-- Update deliberations facilitator_id to use access_ format
UPDATE deliberations 
SET facilitator_id = 'access_' || ac.code
FROM access_codes ac  
WHERE deliberations.facilitator_id = ac.used_by
AND ac.is_used = true;

-- Update ibis_nodes created_by to use access_ format
UPDATE ibis_nodes
SET created_by = 'access_' || ac.code  
FROM access_codes ac
WHERE ibis_nodes.created_by = ac.used_by
AND ac.is_used = true;

-- Update ibis_relationships created_by to use access_ format
UPDATE ibis_relationships
SET created_by = 'access_' || ac.code
FROM access_codes ac
WHERE ibis_relationships.created_by = ac.used_by  
AND ac.is_used = true;

-- Update ibis_node_ratings user_id to use access_ format
UPDATE ibis_node_ratings
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE ibis_node_ratings.user_id = ac.used_by
AND ac.is_used = true;

-- Update submissions user_id to use access_ format
UPDATE submissions
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE submissions.user_id = ac.used_by
AND ac.is_used = true;

-- Update classified_items created_by to use access_ format  
UPDATE classified_items
SET created_by = 'access_' || ac.code
FROM access_codes ac
WHERE classified_items.created_by = ac.used_by
AND ac.is_used = true;

-- Update facilitator_sessions user_id to use access_ format
UPDATE facilitator_sessions
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE facilitator_sessions.user_id = ac.used_by
AND ac.is_used = true;

-- Update user_sessions user_id to use access_ format
UPDATE user_sessions
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE user_sessions.user_id = ac.used_by
AND ac.is_used = true;

-- Update file_processing_logs user_id to use access_ format
UPDATE file_processing_logs
SET user_id = 'access_' || ac.code
FROM access_codes ac
WHERE file_processing_logs.user_id = ac.used_by
AND ac.is_used = true;