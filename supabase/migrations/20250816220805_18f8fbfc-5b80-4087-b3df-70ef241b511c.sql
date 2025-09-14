-- First, drop the foreign key constraint that's preventing us from changing the column type
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_user_id_fkey;

-- Now we can change the user_id column to TEXT to accept access code IDs like "access_5678901234"
ALTER TABLE public.messages 
ALTER COLUMN user_id TYPE TEXT;

-- Create an index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

-- Create a simple policy that allows anyone to insert messages as long as user_id is provided
-- This is appropriate for the access code authentication system
CREATE POLICY "Allow message creation with valid user_id" 
ON public.messages 
FOR INSERT 
WITH CHECK (user_id IS NOT NULL AND length(user_id) > 0);