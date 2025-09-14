-- Enable RLS on all remaining tables to fix security warnings

-- Enable RLS on access_codes table
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- Create policy for access codes - only admins can manage access codes
CREATE POLICY "Only admins can manage access codes" ON public.access_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

-- Enable RLS on remaining tables
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classified_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliberations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ibis_node_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_similarities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simplified_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for agent_configurations
CREATE POLICY "Users can view agent configurations in their deliberations" ON public.agent_configurations
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    ) OR deliberation_id IS NULL
  );

CREATE POLICY "Users can create agent configurations in their deliberations" ON public.agent_configurations
  FOR INSERT WITH CHECK (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    ) AND created_by = get_current_access_code_user()
  );

-- Create policies for deliberations
CREATE POLICY "Users can view public deliberations or their own" ON public.deliberations
  FOR SELECT USING (
    is_public = true OR 
    id IN (SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text)
  );

-- Create policies for participants
CREATE POLICY "Users can view participants in their deliberations" ON public.participants
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can join deliberations" ON public.participants
  FOR INSERT WITH CHECK (user_id = get_current_access_code_user()::text);

-- Create policies for user_sessions
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT USING (user_id = get_current_access_code_user());

CREATE POLICY "Users can create their own sessions" ON public.user_sessions
  FOR INSERT WITH CHECK (user_id = get_current_access_code_user());

-- Create policies for file_processing_logs
CREATE POLICY "Users can view their own file processing logs" ON public.file_processing_logs
  FOR SELECT USING (user_id = get_current_access_code_user());

CREATE POLICY "Users can create their own file processing logs" ON public.file_processing_logs
  FOR INSERT WITH CHECK (user_id = get_current_access_code_user());

-- Create policies for ibis_node_ratings
CREATE POLICY "Users can view IBIS node ratings in their deliberations" ON public.ibis_node_ratings
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can create IBIS node ratings in their deliberations" ON public.ibis_node_ratings
  FOR INSERT WITH CHECK (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    ) AND user_id = get_current_access_code_user()
  );

-- Create policies for submissions
CREATE POLICY "Users can view submissions in their deliberations" ON public.submissions
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can create their own submissions" ON public.submissions
  FOR INSERT WITH CHECK (user_id = get_current_access_code_user());

-- Create policies for classified_items
CREATE POLICY "Users can view classified items in their deliberations" ON public.classified_items
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

CREATE POLICY "Users can create classified items in their deliberations" ON public.classified_items
  FOR INSERT WITH CHECK (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    ) AND created_by = get_current_access_code_user()
  );

-- Create policies for facilitator_sessions
CREATE POLICY "Users can view their own facilitator sessions" ON public.facilitator_sessions
  FOR SELECT USING (user_id = get_current_access_code_user());

CREATE POLICY "Users can create their own facilitator sessions" ON public.facilitator_sessions
  FOR INSERT WITH CHECK (user_id = get_current_access_code_user());

-- Create policies for agent_interactions
CREATE POLICY "Users can view agent interactions in their deliberations" ON public.agent_interactions
  FOR SELECT USING (
    deliberation_id IN (
      SELECT deliberation_id FROM participants WHERE user_id = get_current_access_code_user()::text
    )
  );

-- Create basic read-only policies for lookup tables
CREATE POLICY "Everyone can read keywords" ON public.keywords FOR SELECT USING (true);
CREATE POLICY "Everyone can read item_keywords" ON public.item_keywords FOR SELECT USING (true);
CREATE POLICY "Everyone can read item_relationships" ON public.item_relationships FOR SELECT USING (true);
CREATE POLICY "Everyone can read item_similarities" ON public.item_similarities FOR SELECT USING (true);
CREATE POLICY "Everyone can read simplified_events" ON public.simplified_events FOR SELECT USING (true);

-- Audit logs should only be viewable by admins
CREATE POLICY "Only admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

-- Add comprehensive admin policies for all tables
CREATE POLICY "Access code admins can manage all agent_configurations" ON public.agent_configurations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all deliberations" ON public.deliberations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all participants" ON public.participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all sessions" ON public.user_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all file logs" ON public.file_processing_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all ratings" ON public.ibis_node_ratings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all submissions" ON public.submissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all classified items" ON public.classified_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all facilitator sessions" ON public.facilitator_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );

CREATE POLICY "Access code admins can manage all agent interactions" ON public.agent_interactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM access_codes 
      WHERE code = get_current_user_access_code() 
      AND code_type = 'admin' 
      AND is_active = true
    )
  );