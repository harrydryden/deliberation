-- Update all existing UUID-based user references to access_ format
-- We'll work with the existing UUID columns but update their content

-- First, update participants table to use access_ format
UPDATE participants 
SET user_id = ('access_' || ac.code)::uuid
FROM access_codes ac
WHERE participants.user_id = ac.used_by
AND ac.is_used = true;