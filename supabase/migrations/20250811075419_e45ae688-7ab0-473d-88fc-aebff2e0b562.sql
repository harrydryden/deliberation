-- Fix RLS policies on messages table to restrict users to only see their own messages
-- while allowing admins to see all messages

-- Drop the overly permissive policy that allows users to see all messages in their deliberations
DROP POLICY IF EXISTS "Simple message access" ON public.messages;

-- Update the user message access policy to be more restrictive
-- Users can only see their own messages
CREATE POLICY "Users can view only their own messages" 
ON public.messages 
FOR SELECT 
USING (auth.uid() = user_id);

-- Keep the admin policy for full access
-- (This policy already exists: "Authenticated admins can view all messages")

-- Ensure the existing policies are properly configured
-- Users can create their own messages (already exists)
-- Admins can view all messages (already exists)