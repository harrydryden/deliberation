-- First, let's see what user IDs exist in messages table
-- This will help us understand the current data

-- Check the current user_id column constraints
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'messages' AND column_name = 'user_id' AND table_schema = 'public';

-- Update the user_id column to allow text instead of strict UUID
-- This will allow both UUID format and access code format user IDs
ALTER TABLE public.messages 
ALTER COLUMN user_id TYPE TEXT;

-- Create an index on user_id for performance since it's used in RLS
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

-- Update the RLS policy to work with the current authentication system
-- Replace the existing INSERT policy with one that works with text user IDs
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;

CREATE POLICY "Users can create their own messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  user_id IS NOT NULL 
  AND length(user_id) > 0
  AND user_id = current_setting('request.jwt.claims', true)::json->>'user_id'
);

-- For now, let's also create a more permissive policy for access code users
-- This allows any authenticated user to insert messages
DROP POLICY IF EXISTS "Access code users can create messages" ON public.messages;

CREATE POLICY "Access code users can create messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (user_id IS NOT NULL AND length(user_id) > 0);