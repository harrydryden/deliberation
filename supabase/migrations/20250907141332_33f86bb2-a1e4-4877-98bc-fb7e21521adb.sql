-- Phase 2: Update all RLS policies to use auth_is_admin() before function consolidation

-- Update file_processing_logs policies
DROP POLICY IF EXISTS "Admins can manage all file logs" ON public.file_processing_logs;
DROP POLICY IF EXISTS "Users can view their own file processing logs" ON public.file_processing_logs;

CREATE POLICY "Admins can manage all file logs" 
ON public.file_processing_logs 
FOR ALL 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());

CREATE POLICY "Users can view their own file processing logs" 
ON public.file_processing_logs 
FOR SELECT 
USING ((user_id = auth.uid()) OR auth_is_admin());

-- Update participants policies
DROP POLICY IF EXISTS "Admins can manage all participants" ON public.participants;
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON public.participants;

CREATE POLICY "Admins can manage all participants" 
ON public.participants 
FOR ALL 
USING (auth_is_admin()) 
WITH CHECK (auth_is_admin());

CREATE POLICY "Users can view participants in their deliberations" 
ON public.participants 
FOR SELECT 
USING (
  auth_is_admin() OR 
  (deliberation_id IN (SELECT deliberation_id FROM get_current_user_deliberation_ids()))
);

-- Update agent_configurations policies
DROP POLICY IF EXISTS "Users can create agent configurations" ON public.agent_configurations;
DROP POLICY IF EXISTS "Users can view agent configurations" ON public.agent_configurations;

CREATE POLICY "Users can create agent configurations" 
ON public.agent_configurations 
FOR INSERT 
WITH CHECK (
  auth_is_admin() OR 
  ((deliberation_id IN (SELECT participants.deliberation_id FROM participants WHERE participants.user_id = (auth.uid())::text)) 
   AND (created_by = auth.uid()))
);

CREATE POLICY "Users can view agent configurations" 
ON public.agent_configurations 
FOR SELECT 
USING (
  auth_is_admin() OR 
  (deliberation_id IN (SELECT participants.deliberation_id FROM participants WHERE participants.user_id = (auth.uid())::text)) OR 
  (deliberation_id IS NULL)
);