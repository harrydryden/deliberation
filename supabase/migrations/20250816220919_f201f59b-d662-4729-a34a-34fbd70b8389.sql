-- Drop ALL existing RLS policies on messages table
DROP POLICY IF EXISTS "Temporary allow all message reads" ON public.messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;

-- Drop the foreign key constraint 
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_user_id_fkey;

-- Now change the user_id column to TEXT to accept access code IDs like "access_5678901234"
ALTER TABLE public.messages 
ALTER COLUMN user_id TYPE TEXT;

-- Create an index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

-- Recreate the read policy
CREATE POLICY "Allow all message reads" 
ON public.messages 
FOR SELECT 
USING (true);

-- Create a simple insert policy that allows anyone to insert messages as long as user_id is provided
CREATE POLICY "Allow message creation with valid user_id" 
ON public.messages 
FOR INSERT 
WITH CHECK (user_id IS NOT NULL AND length(user_id) > 0);