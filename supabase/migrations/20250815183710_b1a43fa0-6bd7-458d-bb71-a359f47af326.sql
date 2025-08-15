-- Temporarily allow all authenticated users to read messages
-- This is needed because the app uses access code auth, not Supabase auth
-- so auth.uid() returns null

-- Drop the existing restrictive policies
DROP POLICY IF EXISTS "Authenticated admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view only their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;

-- Create a temporary policy that allows reading messages
-- TODO: This should be replaced with proper access code-based policies when Supabase auth is implemented
CREATE POLICY "Temporary allow all message reads" 
ON public.messages 
FOR SELECT 
USING (true);

-- Keep the insert policy for users to create messages
-- Users can create their own messages policy already exists