-- Fix UUID formatting issues in RLS policies
-- The issue is that get_authenticated_user() returns UUID but some policies are wrapping it in parentheses

-- First, check all current RLS policies that use get_authenticated_user or get_current_access_code_user
-- and fix any UUID casting issues

-- Update agent_configurations policies to properly handle UUIDs
DROP POLICY IF EXISTS "Users can create agent configurations in their deliberations" ON public.agent_configurations;
DROP POLICY IF EXISTS "Users can view agent configurations in their deliberations" ON public.agent_configurations;

CREATE POLICY "Users can create agent configurations in their deliberations"
ON public.agent_configurations
FOR INSERT
WITH CHECK (
  (deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )) 
  AND (created_by = get_authenticated_user())
);

CREATE POLICY "Users can view agent configurations in their deliberations"
ON public.agent_configurations
FOR SELECT
USING (
  (deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )) 
  OR (deliberation_id IS NULL)
);

-- Fix other tables that might have similar issues
-- Update participants policies
DROP POLICY IF EXISTS "Users can create their own participant records" ON public.participants;
DROP POLICY IF EXISTS "Users can view participant records" ON public.participants;

CREATE POLICY "Users can create their own participant records"
ON public.participants
FOR INSERT
WITH CHECK (user_id = get_authenticated_user()::text);

CREATE POLICY "Users can view participant records"
ON public.participants
FOR SELECT
USING (
  user_id = get_authenticated_user()::text OR 
  is_authenticated_admin()
);

-- Update messages policies to ensure proper UUID handling
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON public.messages;

CREATE POLICY "Users can create their own messages"
ON public.messages
FOR INSERT
WITH CHECK (user_id = get_authenticated_user()::text);

CREATE POLICY "Users can view messages in their deliberations"
ON public.messages
FOR SELECT
USING (
  user_id = get_authenticated_user()::text OR 
  is_authenticated_admin() OR
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);

-- Update profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (id = get_authenticated_user());

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (id = get_authenticated_user())
WITH CHECK (id = get_authenticated_user());

-- Update other tables with similar patterns...
-- IBIS nodes
DROP POLICY IF EXISTS "Users can create IBIS nodes in their deliberations" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Users can view IBIS nodes in their deliberations" ON public.ibis_nodes;

CREATE POLICY "Users can create IBIS nodes in their deliberations"
ON public.ibis_nodes
FOR INSERT
WITH CHECK (
  (deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )) 
  AND (created_by = get_authenticated_user())
);

CREATE POLICY "Users can view IBIS nodes in their deliberations"
ON public.ibis_nodes
FOR SELECT
USING (
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);

-- IBIS relationships  
DROP POLICY IF EXISTS "Users can create IBIS relationships in their deliberations" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Users can view IBIS relationships in their deliberations" ON public.ibis_relationships;

CREATE POLICY "Users can create IBIS relationships in their deliberations"
ON public.ibis_relationships
FOR INSERT
WITH CHECK (
  (deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )) 
  AND (created_by = get_authenticated_user())
);

CREATE POLICY "Users can view IBIS relationships in their deliberations"
ON public.ibis_relationships
FOR SELECT
USING (
  deliberation_id IN (
    SELECT participants.deliberation_id
    FROM participants
    WHERE participants.user_id = get_authenticated_user()::text
  )
);