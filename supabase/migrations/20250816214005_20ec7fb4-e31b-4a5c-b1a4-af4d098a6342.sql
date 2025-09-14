-- Update RLS policies for participants table to work with simplified authentication
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can join as participants" ON participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON participants;

-- Create new simplified policies that allow authenticated users to participate
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

-- Also ensure deliberations are readable by anonymous users for public deliberations
DROP POLICY IF EXISTS "Public deliberations readable" ON deliberations;

CREATE POLICY "Public deliberations readable" 
ON deliberations 
FOR SELECT 
TO anon
USING (is_public = true);