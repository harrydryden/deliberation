-- Fix messages table RLS policies with proper roles and functions

-- Drop all existing message policies
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;

-- Create INSERT policy for authenticated users with proper type casting
CREATE POLICY "Authenticated users can create their own messages" 
ON public.messages 
FOR INSERT 
TO authenticated 
WITH CHECK (user_id = (auth.uid())::text);

-- Create UPDATE policy for authenticated users
CREATE POLICY "Authenticated users can update their own messages" 
ON public.messages 
FOR UPDATE 
TO authenticated 
USING (user_id = (auth.uid())::text);

-- Create admin policy for all operations
CREATE POLICY "Admins can manage all messages" 
ON public.messages 
FOR ALL 
TO authenticated 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());