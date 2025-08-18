-- Update authentication functions to use Supabase Auth instead of access codes

-- Update get_authenticated_user function to use auth.uid()
CREATE OR REPLACE FUNCTION public.get_authenticated_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid();
$$;

-- Update is_authenticated_admin function to use user_roles table
CREATE OR REPLACE FUNCTION public.is_authenticated_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT is_admin();
$$;

-- Update get_current_user_deliberation_ids to use auth.uid()
CREATE OR REPLACE FUNCTION public.get_current_user_deliberation_ids()
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = (auth.uid())::text;
$$;

-- Update user_participates_in_deliberation to use standard UUID
CREATE OR REPLACE FUNCTION public.user_participates_in_deliberation(deliberation_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM participants 
    WHERE deliberation_id = deliberation_uuid 
    AND user_id = user_uuid::text
  );
$$;

-- Update is_participant_in_deliberation to use standard UUID
CREATE OR REPLACE FUNCTION public.is_participant_in_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = $1 
    AND participants.user_id = $2::text
  );
$$;

-- Update is_facilitator_of_deliberation to use standard UUID  
CREATE OR REPLACE FUNCTION public.is_facilitator_of_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM deliberations 
    WHERE deliberations.id = $1 
    AND deliberations.facilitator_id = $2::text
  );
$$;