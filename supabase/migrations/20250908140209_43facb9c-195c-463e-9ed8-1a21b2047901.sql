-- Update RLS policy to handle non-public deliberations correctly
-- Draft, archived, and concluded deliberations should only be visible to admins and participants

-- Drop existing policy and recreate with better logic
DROP POLICY IF EXISTS "Users can view public deliberations and their own" ON public.deliberations;

-- Create new policy that properly handles visibility
CREATE POLICY "Users can view deliberations based on status and participation" 
  ON public.deliberations 
  FOR SELECT 
  USING (
    -- Admins can see everything
    auth_is_admin() 
    OR 
    -- Active and public deliberations are visible to everyone
    (status = 'active' AND is_public = true)
    OR
    -- Users can see deliberations they participate in regardless of status
    (id IN (SELECT participants.deliberation_id FROM participants WHERE participants.user_id = (auth.uid())::text))
  );