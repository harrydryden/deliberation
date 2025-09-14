-- Fix RLS policies for messages table with proper type casting

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can create messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can create messages in their deliberations" ON public.messages;

-- Create proper policies with correct type casting
CREATE POLICY "Users can create their own messages" 
ON public.messages 
FOR INSERT 
TO authenticated 
WITH CHECK (user_id = (auth.uid())::text);

CREATE POLICY "Users can update their own messages" 
ON public.messages 
FOR UPDATE 
TO authenticated 
USING (user_id = (auth.uid())::text);

-- Allow participants to create messages in deliberations they're part of
CREATE POLICY "Participants can create messages in deliberations" 
ON public.messages 
FOR INSERT 
TO authenticated 
WITH CHECK (
  user_id = (auth.uid())::text AND
  deliberation_id IN (
    SELECT p.deliberation_id 
    FROM public.participants p 
    WHERE p.user_id = (auth.uid())::text
  )
);

-- Admin policy with proper admin check
CREATE POLICY "Admins can manage all messages" 
ON public.messages 
FOR ALL 
TO authenticated 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());