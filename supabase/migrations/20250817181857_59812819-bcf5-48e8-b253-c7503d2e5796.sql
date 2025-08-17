-- Fix infinite recursion in participants table RLS policy
-- The issue is that the policy is querying the participants table while being applied to it

-- First, create a security definer function to check participation safely
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
    AND user_id = user_uuid
  );
$$;

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON public.participants;

-- Create a new policy using the security definer function
CREATE POLICY "Users can view participants in their deliberations" 
ON public.participants 
FOR SELECT 
USING (
  user_participates_in_deliberation(deliberation_id, get_current_access_code_user()) 
  OR is_admin_access_code_user()
);