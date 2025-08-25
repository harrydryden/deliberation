-- Fix messages and participants table RLS policies to work with Supabase Auth
-- The current policies are expecting the old access code system but users are now authenticated with Supabase Auth

-- ========================================
-- FIX MESSAGES TABLE RLS POLICIES
-- ========================================

-- First, drop all existing conflicting policies
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages submitted to IBIS in deliberations they participate in" ON public.messages;
DROP POLICY IF EXISTS "Admin and user message access" ON public.messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in deliberations they join" ON public.messages;
DROP POLICY IF EXISTS "Users can only view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages as themselves" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in deliberations" ON public.messages;
DROP POLICY IF EXISTS "Users can view agent messages directed to them" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

-- Create new policies that work with Supabase Auth
-- 1. Users can create their own messages
CREATE POLICY "Users can create their own messages"
ON public.messages
FOR INSERT
WITH CHECK (user_id = (auth.uid())::text);

-- 2. Users can view their own messages
CREATE POLICY "Users can view their own messages"
ON public.messages
FOR SELECT
USING (user_id = (auth.uid())::text);

-- 3. Users can view messages in deliberations they participate in
CREATE POLICY "Users can view deliberation messages"
ON public.messages
FOR SELECT
USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 4. Users can update their own messages (for IBIS submission status)
CREATE POLICY "Users can update their own messages"
ON public.messages
FOR UPDATE
USING (user_id = (auth.uid())::text)
WITH CHECK (user_id = (auth.uid())::text);

-- 5. Service role can manage all messages (for edge functions)
CREATE POLICY "Service role can manage all messages"
ON public.messages
FOR ALL
USING (auth.role() = 'service_role');

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id_deliberation ON public.messages(user_id, deliberation_id);
CREATE INDEX IF NOT EXISTS idx_messages_submitted_to_ibis_deliberation ON public.messages(submitted_to_ibis, deliberation_id) WHERE submitted_to_ibis = true;

-- ========================================
-- FIX PARTICIPANTS TABLE RLS POLICIES
-- ========================================

-- Drop all existing conflicting policies
DROP POLICY IF EXISTS "Anyone can join as participant" ON public.participants;
DROP POLICY IF EXISTS "Anyone can view participants" ON public.participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON public.participants;
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON public.participants;
DROP POLICY IF EXISTS "Users can create their own participant records" ON public.participants;
DROP POLICY IF EXISTS "Users can view own participant records" ON public.participants;
DROP POLICY IF EXISTS "Admins can view all participants" ON public.participants;
DROP POLICY IF EXISTS "Participants can view all participants in their deliberations" ON public.participants;
DROP POLICY IF EXISTS "Authenticated can view participants" ON public.participants;
DROP POLICY IF EXISTS "Users can view participant records" ON public.participants;

-- Create new policies that work with Supabase Auth
-- 1. Users can join deliberations
CREATE POLICY "Users can join deliberations"
ON public.participants
FOR INSERT
WITH CHECK (user_id = (auth.uid())::text);

-- 2. Users can view participants in deliberations they participate in
CREATE POLICY "Users can view deliberation participants"
ON public.participants
FOR SELECT
USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 3. Users can leave deliberations (delete their own participation)
CREATE POLICY "Users can leave deliberations"
ON public.participants
FOR DELETE
USING (user_id = (auth.uid())::text);

-- 4. Service role can manage all participants (for edge functions)
CREATE POLICY "Service role can manage all participants"
ON public.participants
FOR ALL
USING (auth.role() = 'service_role');

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_participants_user_id_deliberation ON public.participants(user_id, deliberation_id);
