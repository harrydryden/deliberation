-- Find and drop the foreign key constraint forcefully
-- First, get the exact constraint name
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint 
WHERE contype = 'f' 
AND conrelid = 'participants'::regclass;