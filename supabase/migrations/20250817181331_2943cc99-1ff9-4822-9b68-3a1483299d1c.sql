-- Fix critical privacy issue: users can see all messages
-- Implement proper user segmentation for messages

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all message reads" ON public.messages;

-- Create proper segmented message access policy
-- Users can only see:
-- 1. Their own messages (based on user_id matching current user)
-- 2. Messages in deliberations they participate in (if deliberation_id is set)
CREATE POLICY "Users can only see their own messages and deliberation messages"
ON public.messages 
FOR SELECT 
USING (
  -- Users can see their own messages
  user_id = get_current_access_code_user()::text
  OR
  -- Users can see messages in deliberations they participate in
  (
    deliberation_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM participants p 
      WHERE p.deliberation_id = messages.deliberation_id 
      AND p.user_id = get_current_access_code_user()
    )
  )
  OR
  -- Admins can see all messages
  is_admin_access_code_user()
);

-- Update the insert policy to ensure proper user context
DROP POLICY IF EXISTS "Allow message creation with valid user_id" ON public.messages;
CREATE POLICY "Users can create messages as themselves"
ON public.messages 
FOR INSERT 
WITH CHECK (
  user_id IS NOT NULL 
  AND length(user_id) > 0 
  AND get_current_access_code_user() IS NOT NULL
  AND (
    -- User is creating their own message
    user_id = get_current_access_code_user()::text
    OR
    -- System/agent messages (no current user context)
    get_current_access_code_user() IS NULL
  )
);

-- Also ensure proper segmentation for participants table
-- Users should only see participants in deliberations they're part of
DROP POLICY IF EXISTS "Anyone can view participants" ON public.participants;
CREATE POLICY "Users can view participants in their deliberations"
ON public.participants
FOR SELECT
USING (
  -- User can see participants in deliberations they're part of
  EXISTS (
    SELECT 1 FROM participants p2
    WHERE p2.deliberation_id = participants.deliberation_id
    AND p2.user_id = get_current_access_code_user()
  )
  OR
  -- Admins can see all participants
  is_admin_access_code_user()
);