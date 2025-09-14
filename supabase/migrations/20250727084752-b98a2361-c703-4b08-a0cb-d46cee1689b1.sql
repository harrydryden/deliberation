-- Step 1: Drop all dependent policies first, then recreate them with the new function

-- Drop policies that depend on is_admin_user
DROP POLICY IF EXISTS "Authenticated admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated admins can view all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Authenticated admins can manage all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Authenticated admins can view all participants" ON public.participants;
DROP POLICY IF EXISTS "Authenticated admins can manage all participants" ON public.participants;
DROP POLICY IF EXISTS "Authenticated admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated admins can view all agent interactions" ON public.agent_interactions;
DROP POLICY IF EXISTS "Only admins can create deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can manage all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can manage all participants" ON public.participants;

-- Now drop the old function
DROP FUNCTION IF EXISTS public.is_admin_user(uuid);

-- Create the session user ID function
CREATE OR REPLACE FUNCTION public.get_current_session_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('request.headers.x-user-id', true);
$$;

-- Create new is_admin_user function that works with text user IDs
CREATE OR REPLACE FUNCTION public.is_admin_user(input_user_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id::text = COALESCE(input_user_id, get_current_session_user_id()) 
    AND user_role = 'admin'
  );
$$;