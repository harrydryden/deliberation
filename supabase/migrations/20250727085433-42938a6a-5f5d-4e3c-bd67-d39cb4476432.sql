-- Fix function search path security warning
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

CREATE OR REPLACE FUNCTION public.is_facilitator_of_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM deliberations 
    WHERE deliberations.id = $1 
    AND deliberations.facilitator_id = $2
  );
$$;