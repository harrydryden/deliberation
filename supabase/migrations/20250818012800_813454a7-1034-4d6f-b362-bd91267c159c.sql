-- Fix infinite recursion in RLS policies by creating security definer functions
-- First, create proper security definer functions to avoid recursion

-- Drop problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;

-- Create a security definer function to get user deliberation IDs
CREATE OR REPLACE FUNCTION public.get_user_deliberation_ids_safe(user_uuid uuid)
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = user_uuid::text;
$function$;

-- Create a security definer function to get current user's deliberation IDs
CREATE OR REPLACE FUNCTION public.get_current_user_deliberation_ids()
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT deliberation_id 
  FROM get_user_deliberation_ids_safe(get_current_access_code_user());
$function$;

-- Recreate the policy using the security definer function to prevent recursion
CREATE POLICY "Users can view participants in their deliberations" 
ON participants 
FOR SELECT 
USING (
  deliberation_id IN (
    SELECT deliberation_id FROM get_current_user_deliberation_ids()
  )
);

-- Fix the messages view policy to also use security definer approach
DROP POLICY IF EXISTS "Users can view messages in their deliberations" ON messages;
CREATE POLICY "Users can view messages in their deliberations" 
ON messages 
FOR SELECT 
USING (
  deliberation_id IN (
    SELECT deliberation_id FROM get_current_user_deliberation_ids()
  )
);