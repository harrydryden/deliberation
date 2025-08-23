-- Fix the critical RLS policy violation for messages table
-- This ensures users can only see their own messages OR messages submitted to IBIS

-- Drop the problematic policy that allows all participants to see all messages
DROP POLICY IF EXISTS "Admin and user message access" ON public.messages;

-- Create new secure policies

-- 1. Users can view their own messages
CREATE POLICY "Users can view their own messages"
ON public.messages
FOR SELECT
TO authenticated
USING (user_id = (get_authenticated_user())::text);

-- 2. Users can view messages submitted to IBIS in deliberations they participate in
CREATE POLICY "Users can view IBIS submitted messages in their deliberations"
ON public.messages
FOR SELECT
TO authenticated
USING (
  submitted_to_ibis = true 
  AND deliberation_id IN (
    SELECT participants.deliberation_id 
    FROM participants 
    WHERE participants.user_id = (get_authenticated_user())::text
  )
);

-- 3. Admins can view all messages (keep existing admin policy)
-- The "Admins can manage all messages" policy already exists and covers this

-- Add index to improve performance for the new policies
CREATE INDEX IF NOT EXISTS idx_messages_user_id_deliberation ON public.messages(user_id, deliberation_id);
CREATE INDEX IF NOT EXISTS idx_messages_submitted_to_ibis_deliberation ON public.messages(submitted_to_ibis, deliberation_id) WHERE submitted_to_ibis = true;