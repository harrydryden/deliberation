-- Fix infinite recursion in participants RLS policy
-- Create a security definer function to get user's deliberations without recursion

CREATE OR REPLACE FUNCTION public.get_user_deliberation_ids(user_uuid text)
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = user_uuid;
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON public.participants;

-- Create a new non-recursive policy using the security definer function
CREATE POLICY "Users can view participants in their deliberations"
ON public.participants
FOR SELECT
USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM get_user_deliberation_ids((get_current_access_code_user())::text)
  )
);