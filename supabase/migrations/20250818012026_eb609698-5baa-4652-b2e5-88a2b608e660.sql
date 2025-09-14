-- Fix messages RLS policies to use proper UUID function instead of access code string
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Access code users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Access code users can view messages in their deliberations" ON public.messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON public.messages;

-- Create new policies using the proper UUID function
CREATE POLICY "Users can create their own messages"
ON public.messages
FOR INSERT
WITH CHECK (
  user_id = (get_current_access_code_user())::text
);

CREATE POLICY "Users can view messages in their deliberations"
ON public.messages
FOR SELECT
USING (
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = (get_current_access_code_user())::text
  )
);