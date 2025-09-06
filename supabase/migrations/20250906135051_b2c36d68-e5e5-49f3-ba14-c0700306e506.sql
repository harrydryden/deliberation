-- Fix all message policies to use consistent auth.uid() function

-- Drop all existing message policies to start fresh
DROP POLICY IF EXISTS "Authenticated users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view IBIS submitted messages in their deliberations" ON public.messages;

-- Create consistent policies using auth.uid() throughout
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

CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
TO authenticated 
USING (user_id = (auth.uid())::text);

CREATE POLICY "Users can view IBIS messages in their deliberations" 
ON public.messages 
FOR SELECT 
TO authenticated 
USING (
  submitted_to_ibis = true AND 
  deliberation_id IN (
    SELECT p.deliberation_id 
    FROM participants p 
    WHERE p.user_id = (auth.uid())::text
  )
);

CREATE POLICY "Admins can manage all messages" 
ON public.messages 
FOR ALL 
TO authenticated 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());