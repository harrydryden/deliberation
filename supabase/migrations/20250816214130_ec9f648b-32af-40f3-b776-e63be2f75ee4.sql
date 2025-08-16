-- Remove the foreign key constraint on participants table since we're using simplified authentication
-- and don't have users in the auth.users table

-- Drop the existing foreign key constraint
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS participants_user_id_fkey;

-- Change the user_id column type to TEXT to work with our simplified authentication
ALTER TABLE participants 
ALTER COLUMN user_id TYPE TEXT;