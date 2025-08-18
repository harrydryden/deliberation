-- Fix infinite recursion in RLS policies by using security definer functions
-- First, create security definer functions to avoid recursion

-- Function to get user's deliberation IDs safely
CREATE OR REPLACE FUNCTION public.get_user_deliberations(user_uuid uuid)
RETURNS TABLE(deliberation_id uuid)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = user_uuid::text;
$$;

-- Function to check if user participates in a deliberation
CREATE OR REPLACE FUNCTION public.user_participates_in_deliberation_safe(deliberation_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM participants 
    WHERE deliberation_id = deliberation_uuid 
    AND user_id = user_uuid::text
  );
$$;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON messages;

-- Create new safe policies for participants
CREATE POLICY "Users can view their own participant records" 
ON participants 
FOR SELECT
USING (user_id = (get_current_access_code_user())::text);

-- Create new safe policies for messages using the security definer function
CREATE POLICY "Users can view messages in their deliberations" 
ON messages 
FOR SELECT
USING (
  user_id = (get_current_access_code_user())::text
  OR 
  user_participates_in_deliberation_safe(deliberation_id, get_current_access_code_user())
);

-- Update the participants view policy to be admin-only for viewing others
-- Regular users can only see their own records
CREATE POLICY "Admins can view all participants" 
ON participants 
FOR SELECT
USING (
  user_id = (get_current_access_code_user())::text
  OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = get_current_access_code_user() 
    AND (role = 'admin' OR user_role = 'admin')
  )
);