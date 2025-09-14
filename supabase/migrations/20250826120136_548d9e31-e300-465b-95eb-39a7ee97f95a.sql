-- Fix infinite recursion in participants RLS policy
-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;

-- Create a safe policy using existing security definer function
CREATE POLICY "Users can view participants in their deliberations" 
ON participants 
FOR SELECT 
USING (
  is_authenticated_admin() OR
  deliberation_id IN (
    SELECT deliberation_id FROM get_current_user_deliberation_ids()
  )
);