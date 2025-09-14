-- Drop the specific foreign key constraint that's causing the issue
ALTER TABLE participants DROP CONSTRAINT participants_user_id_fkey;