-- Fix RLS policies for messages table to allow authenticated users to create messages

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;

-- Create proper policies for authenticated users
CREATE POLICY "Users can create messages" 
ON public.messages 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages" 
ON public.messages 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

-- Create policy for admins (users with admin role)
CREATE POLICY "Admins can manage all messages" 
ON public.messages 
FOR ALL 
TO authenticated 
USING (
  auth.uid() IN (
    SELECT user_id FROM public.user_roles WHERE role_type = 'admin'
  )
);

-- Ensure participants can insert messages in deliberations they're part of
CREATE POLICY "Participants can create messages in their deliberations" 
ON public.messages 
FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM public.participants WHERE deliberation_id = messages.deliberation_id
  )
);