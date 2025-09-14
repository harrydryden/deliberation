-- Update RLS policies to work with custom session management instead of auth.uid()

-- First, let's create a function to get the current session user ID from the custom header
CREATE OR REPLACE FUNCTION public.get_current_session_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('request.headers.x-user-id', true);
$$;

-- Update profiles policies to work with session-based auth
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (id = get_current_session_user_id());

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (id = get_current_session_user_id());

-- Update messages policies
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view agent messages directed to them" ON public.messages;

CREATE POLICY "Users can create their own messages"
ON public.messages
FOR INSERT
WITH CHECK (user_id = get_current_session_user_id());

CREATE POLICY "Users can view their own messages"
ON public.messages
FOR SELECT
USING (user_id = get_current_session_user_id());

CREATE POLICY "Users can view agent messages directed to them"
ON public.messages
FOR SELECT
USING (
  message_type = ANY (ARRAY['bill_agent'::message_type, 'peer_agent'::message_type, 'flow_agent'::message_type]) 
  AND user_id = get_current_session_user_id()
);

-- Update participants policies
DROP POLICY IF EXISTS "Users can join deliberations" ON public.participants;

CREATE POLICY "Users can join deliberations"
ON public.participants
FOR INSERT
WITH CHECK (user_id = get_current_session_user_id());

-- Update ibis_nodes policies
DROP POLICY IF EXISTS "Participants can create IBIS nodes" ON public.ibis_nodes;

CREATE POLICY "Participants can create IBIS nodes"
ON public.ibis_nodes
FOR INSERT
WITH CHECK (
  created_by = get_current_session_user_id() 
  AND EXISTS (
    SELECT 1 FROM participants 
    WHERE deliberation_id = ibis_nodes.deliberation_id 
    AND user_id = get_current_session_user_id()
  )
);

-- Update the is_admin_user function to work with session-based auth
DROP FUNCTION IF EXISTS public.is_admin_user(uuid);

CREATE OR REPLACE FUNCTION public.is_admin_user(user_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = COALESCE(user_id, get_current_session_user_id()) 
    AND user_role = 'admin'
  );
$$;