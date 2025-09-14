-- Fix infinite recursion in participants RLS policy by using a security definer function
DROP POLICY IF EXISTS "Participants can view all participants in their deliberations" ON participants;

-- Create a security definer function to check if user is participant in a deliberation
CREATE OR REPLACE FUNCTION public.is_user_participant_in_deliberation(deliberation_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM participants 
    WHERE deliberation_id = deliberation_uuid 
    AND user_id = user_uuid
  );
$$;

-- Create new policy using the security definer function
CREATE POLICY "Participants can view all participants in their deliberations" 
ON participants 
FOR SELECT 
USING (
  public.is_user_participant_in_deliberation(deliberation_id, auth.uid()) 
  OR is_admin_user(auth.uid())
);