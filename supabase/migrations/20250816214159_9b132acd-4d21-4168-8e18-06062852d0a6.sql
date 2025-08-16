-- Drop all policies that reference user_id columns to allow type changes
DROP POLICY IF EXISTS "Participants can view agent interactions" ON agent_interactions;
DROP POLICY IF EXISTS "Participants can read agent configurations for their deliberati" ON agent_configurations;
DROP POLICY IF EXISTS "Users can join as participants" ON participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON participants;
DROP POLICY IF EXISTS "Authenticated can view participants" ON participants;
DROP POLICY IF EXISTS "Anyone can join as participant" ON participants;
DROP POLICY IF EXISTS "Anyone can view participants" ON participants;

-- Drop the foreign key constraints
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS participants_user_id_fkey;

ALTER TABLE deliberations 
DROP CONSTRAINT IF EXISTS deliberations_facilitator_id_fkey;

-- Change the user_id column types to TEXT
ALTER TABLE participants 
ALTER COLUMN user_id TYPE TEXT;

ALTER TABLE deliberations 
ALTER COLUMN facilitator_id TYPE TEXT;

-- Recreate simplified policies
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

CREATE POLICY "Participants can view agent interactions" 
ON agent_interactions 
FOR SELECT 
TO anon
USING (true);

CREATE POLICY "Anyone can read agent configurations" 
ON agent_configurations 
FOR SELECT 
TO anon
USING (true);