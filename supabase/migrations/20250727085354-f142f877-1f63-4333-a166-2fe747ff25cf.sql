-- Fix infinite recursion in participants table policies

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Participants can view deliberation members" ON public.participants;
DROP POLICY IF EXISTS "Facilitators can manage participants" ON public.participants;

-- Create a security definer function to check if user is participant without recursion
CREATE OR REPLACE FUNCTION public.is_participant_in_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants 
    WHERE participants.deliberation_id = $1 
    AND participants.user_id = $2
  );
$$;

-- Create a security definer function to check if user is facilitator without recursion
CREATE OR REPLACE FUNCTION public.is_facilitator_of_deliberation(deliberation_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliberations 
    WHERE deliberations.id = $1 
    AND deliberations.facilitator_id = $2
  );
$$;

-- Recreate the policies using these functions
CREATE POLICY "Participants can view deliberation members"
ON public.participants
FOR SELECT
USING (is_participant_in_deliberation(deliberation_id, auth.uid()));

CREATE POLICY "Facilitators can manage participants"
ON public.participants
FOR ALL
USING (is_facilitator_of_deliberation(deliberation_id, auth.uid()));

-- Also fix any other potentially recursive policies
DROP POLICY IF EXISTS "Participants can view IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Participants can create IBIS nodes" ON public.ibis_nodes;

CREATE POLICY "Participants can view IBIS nodes"
ON public.ibis_nodes
FOR SELECT
USING (is_participant_in_deliberation(deliberation_id, auth.uid()));

CREATE POLICY "Participants can create IBIS nodes"
ON public.ibis_nodes
FOR INSERT
WITH CHECK (
  created_by = auth.uid() 
  AND is_participant_in_deliberation(deliberation_id, auth.uid())
);