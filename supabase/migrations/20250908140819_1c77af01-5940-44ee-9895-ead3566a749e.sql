-- Update RLS policy with specific visibility rules per status
-- Active + public: visible to everyone
-- Concluded: visible to participants 
-- Archived or draft: only visible to admins

-- Drop existing policy and recreate with correct logic
DROP POLICY IF EXISTS "Users can view deliberations based on status and participation" ON public.deliberations;

-- Create policy with specific status-based visibility rules
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
    -- Concluded deliberations are visible to participants only
    (status = 'concluded' AND id IN (SELECT participants.deliberation_id FROM participants WHERE participants.user_id = (auth.uid())::text))
  );