-- Get the definition of the notions view
SELECT pg_get_viewdef('public.notions'::regclass, true) AS notions_view_definition;

-- Fix the functions with mutable search paths
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND user_role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_participant_in_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = $1 
    AND participants.user_id = $2
  );
$$;