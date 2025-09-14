-- First drop policies that depend on the user_id column
DROP POLICY IF EXISTS "Participants can view agent interactions" ON agent_interactions;

-- Drop the foreign key constraint
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS participants_user_id_fkey;

-- Change the user_id column type to TEXT to work with our simplified authentication
ALTER TABLE participants 
ALTER COLUMN user_id TYPE TEXT;

-- Also update other tables that might have similar issues
ALTER TABLE deliberations 
DROP CONSTRAINT IF EXISTS deliberations_facilitator_id_fkey;

ALTER TABLE deliberations 
ALTER COLUMN facilitator_id TYPE TEXT;

-- Recreate the policy for agent interactions with proper logic
CREATE POLICY "Participants can view agent interactions" 
ON agent_interactions 
FOR SELECT 
TO anon
USING (
  EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = agent_interactions.deliberation_id
  )
);