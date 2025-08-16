-- Force remove the foreign key constraint that's causing the issue
-- We need to use a more direct approach since the previous attempts failed

-- First, let's recreate the participants table without the foreign key constraint
CREATE TABLE participants_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID,
    user_id TEXT NOT NULL,  -- Changed to TEXT to support our simplified auth
    role TEXT DEFAULT 'participant',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Copy existing data
INSERT INTO participants_new (id, deliberation_id, user_id, role, joined_at, last_active)
SELECT id, deliberation_id, user_id::TEXT, role, joined_at, last_active 
FROM participants;

-- Drop the old table
DROP TABLE participants;

-- Rename the new table
ALTER TABLE participants_new RENAME TO participants;

-- Enable RLS on the new table
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Create the simplified policies
CREATE POLICY "Anyone can join as participant" 
ON participants 
FOR INSERT 
TO anon
WITH CHECK (true);

CREATE POLICY "Anyone can view participants" 
ON participants 
FOR SELECT 
TO anon
USING (true);

CREATE POLICY "Users can leave deliberations" 
ON participants 
FOR DELETE 
TO anon
USING (true);