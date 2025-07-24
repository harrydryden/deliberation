-- Fix the infinite recursion in the participants RLS policy
DROP POLICY IF EXISTS "Participants can view deliberation members" ON participants;

CREATE POLICY "Participants can view deliberation members" 
ON participants 
FOR SELECT 
USING (EXISTS ( 
  SELECT 1
  FROM participants p2
  WHERE p2.deliberation_id = participants.deliberation_id 
  AND p2.user_id = auth.uid()
));