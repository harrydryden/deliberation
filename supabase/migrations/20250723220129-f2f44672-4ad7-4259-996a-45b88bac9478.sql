-- Update messages table for single-user chat functionality
-- Remove deliberation_id requirement and make it nullable for single-user chats
ALTER TABLE public.messages ALTER COLUMN deliberation_id DROP NOT NULL;

-- Update RLS policies to support single-user chat
-- Drop existing policies
DROP POLICY IF EXISTS "Participants can create messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can view deliberation messages" ON public.messages;

-- Create new policies for single-user chat
CREATE POLICY "Users can create their own messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow system/agents to insert messages for users (for AI responses)
CREATE POLICY "System can create agent messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  message_type IN ('bill_agent', 'peer_agent', 'flow_agent') AND
  user_id IS NOT NULL
);

-- Allow users to view agent messages directed to them
CREATE POLICY "Users can view agent messages directed to them" 
ON public.messages 
FOR SELECT 
USING (
  message_type IN ('bill_agent', 'peer_agent', 'flow_agent') AND
  auth.uid() = user_id
);