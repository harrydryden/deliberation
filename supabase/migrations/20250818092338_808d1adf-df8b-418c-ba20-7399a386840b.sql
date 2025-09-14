-- Fix infinite recursion in RLS policies by using security definer functions
-- First, create security definer functions to avoid recursion

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

-- Drop ALL existing policies that might cause conflicts
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON messages;
DROP POLICY IF EXISTS "Users can view their own participant records" ON participants;
DROP POLICY IF EXISTS "Admins can view all participants" ON participants;

-- Create simple, non-recursive policies

-- For participants: users can only see their own records, admins can see all
CREATE POLICY "Users can view own participant records" 
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

-- For messages: use the security definer function to avoid recursion
CREATE POLICY "Users can view messages in deliberations they join" 
ON messages 
FOR SELECT
USING (
  user_id = (get_current_access_code_user())::text
  OR 
  user_participates_in_deliberation_safe(deliberation_id, get_current_access_code_user())
  OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = get_current_access_code_user() 
    AND (role = 'admin' OR user_role = 'admin')
  )
);