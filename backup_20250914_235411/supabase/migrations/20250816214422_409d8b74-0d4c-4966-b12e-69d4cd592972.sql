-- Try a different approach - just modify the constraint and column directly
-- First, find and drop the specific foreign key constraint

-- Get the constraint name and drop it
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the foreign key constraint name
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'participants' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id';
    
    -- Drop the constraint if it exists
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE participants DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

-- Add a temporary column with TEXT type
ALTER TABLE participants ADD COLUMN user_id_text TEXT;

-- Copy data from user_id to user_id_text
UPDATE participants SET user_id_text = user_id::TEXT;

-- Drop the old column
ALTER TABLE participants DROP COLUMN user_id;

-- Rename the new column
ALTER TABLE participants RENAME COLUMN user_id_text TO user_id;

-- Make the column NOT NULL
ALTER TABLE participants ALTER COLUMN user_id SET NOT NULL;