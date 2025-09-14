-- COMPREHENSIVE AUTH SYSTEM OVERHAUL
-- Migrate from dual access code/supabase auth to pure Supabase Auth

-- 1. Clean up RLS policies to use only Supabase Auth
DROP POLICY IF EXISTS "Access code admins can manage all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can create their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can view submissions in their deliberations" ON public.submissions;

CREATE POLICY "Admins can manage all submissions" ON public.submissions
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create their own submissions" ON public.submissions
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view submissions in their deliberations" ON public.submissions
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 2. Update classified_items policies
DROP POLICY IF EXISTS "Access code admins can manage all classified items" ON public.classified_items;
DROP POLICY IF EXISTS "Users can create classified items in their deliberations" ON public.classified_items;
DROP POLICY IF EXISTS "Users can view classified items in their deliberations" ON public.classified_items;

CREATE POLICY "Admins can manage all classified items" ON public.classified_items
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create classified items in their deliberations" ON public.classified_items
FOR INSERT WITH CHECK (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  ) AND created_by = auth.uid()
);

CREATE POLICY "Users can view classified items in their deliberations" ON public.classified_items
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 3. Update facilitator_sessions policies
DROP POLICY IF EXISTS "Access code admins can manage all facilitator sessions" ON public.facilitator_sessions;
DROP POLICY IF EXISTS "Users can create their own facilitator sessions" ON public.facilitator_sessions;
DROP POLICY IF EXISTS "Users can view their own facilitator sessions" ON public.facilitator_sessions;

CREATE POLICY "Admins can manage all facilitator sessions" ON public.facilitator_sessions
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create their own facilitator sessions" ON public.facilitator_sessions
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own facilitator sessions" ON public.facilitator_sessions
FOR SELECT USING (user_id = auth.uid());

-- 4. Update agent_interactions policies
DROP POLICY IF EXISTS "Access code admins can manage all agent interactions" ON public.agent_interactions;
DROP POLICY IF EXISTS "Users can view agent interactions in their deliberations" ON public.agent_interactions;

CREATE POLICY "Admins can manage all agent interactions" ON public.agent_interactions
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can view agent interactions in their deliberations" ON public.agent_interactions
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 5. Update ibis_node_ratings policies
DROP POLICY IF EXISTS "Access code admins can manage all ratings" ON public.ibis_node_ratings;
DROP POLICY IF EXISTS "Users can create IBIS node ratings in their deliberations" ON public.ibis_node_ratings;
DROP POLICY IF EXISTS "Users can view IBIS node ratings in their deliberations" ON public.ibis_node_ratings;

CREATE POLICY "Admins can manage all ratings" ON public.ibis_node_ratings
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create IBIS node ratings in their deliberations" ON public.ibis_node_ratings
FOR INSERT WITH CHECK (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  ) AND user_id = auth.uid()
);

CREATE POLICY "Users can view IBIS node ratings in their deliberations" ON public.ibis_node_ratings
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 6. Update agent_configurations policies
DROP POLICY IF EXISTS "Access code admins can manage all agent_configurations" ON public.agent_configurations;
DROP POLICY IF EXISTS "Users can create agent configurations in their deliberations" ON public.agent_configurations;
DROP POLICY IF EXISTS "Users can view agent configurations in their deliberations" ON public.agent_configurations;

CREATE POLICY "Admins can manage all agent_configurations" ON public.agent_configurations
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create agent configurations in their deliberations" ON public.agent_configurations
FOR INSERT WITH CHECK (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  ) AND created_by = auth.uid()
);

CREATE POLICY "Users can view agent configurations in their deliberations" ON public.agent_configurations
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  ) OR deliberation_id IS NULL
);

-- 7. Update ibis_relationships policies
DROP POLICY IF EXISTS "Access code admins can manage all IBIS relationships" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Access code users can create IBIS relationships in their delibe" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Access code users can view IBIS relationships in their delibera" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Admins can manage all IBIS relationships" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Users can create IBIS relationships in their deliberations" ON public.ibis_relationships;
DROP POLICY IF EXISTS "Users can view IBIS relationships in their deliberations" ON public.ibis_relationships;

CREATE POLICY "Admins can manage all IBIS relationships" ON public.ibis_relationships
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create IBIS relationships in their deliberations" ON public.ibis_relationships
FOR INSERT WITH CHECK (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  ) AND created_by = auth.uid()
);

CREATE POLICY "Users can view IBIS relationships in their deliberations" ON public.ibis_relationships
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 8. Update ibis_nodes policies
DROP POLICY IF EXISTS "Access code admins can manage all IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Admins can manage all IBIS nodes" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Users can create IBIS nodes in their deliberations" ON public.ibis_nodes;
DROP POLICY IF EXISTS "Users can view IBIS nodes in their deliberations" ON public.ibis_nodes;

CREATE POLICY "Admins can manage all IBIS nodes" ON public.ibis_nodes
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create IBIS nodes in their deliberations" ON public.ibis_nodes
FOR INSERT WITH CHECK (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  ) AND created_by = auth.uid()
);

CREATE POLICY "Users can view IBIS nodes in their deliberations" ON public.ibis_nodes
FOR SELECT USING (
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 9. Update user_sessions policies
DROP POLICY IF EXISTS "Access code admins can manage all sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;

CREATE POLICY "Admins can manage all sessions" ON public.user_sessions
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create their own sessions" ON public.user_sessions
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own sessions" ON public.user_sessions
FOR SELECT USING (user_id = auth.uid());

-- 10. Clean up messages policies to use only Supabase auth
DROP POLICY IF EXISTS "Admin and user message access" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.messages;
DROP POLICY IF EXISTS "Users can create their own messages" ON public.messages;

CREATE POLICY "Admins can manage all messages" ON public.messages
FOR ALL USING (auth_is_admin());

CREATE POLICY "Users can create their own messages" ON public.messages
FOR INSERT WITH CHECK (user_id = (auth.uid())::text);

CREATE POLICY "Users can view messages in their deliberations" ON public.messages
FOR SELECT USING (
  auth_is_admin() OR 
  user_id = (auth.uid())::text OR 
  deliberation_id IN (
    SELECT deliberation_id 
    FROM participants 
    WHERE user_id = (auth.uid())::text
  )
);

-- 11. Update access_codes policies (keep for legacy data)
DROP POLICY IF EXISTS "Admin and auth access code access" ON public.access_codes;
DROP POLICY IF EXISTS "Admins can manage access codes" ON public.access_codes;

CREATE POLICY "Admins can manage access codes" ON public.access_codes
FOR ALL USING (auth_is_admin());

-- 12. Replace legacy functions with Supabase Auth versions
CREATE OR REPLACE FUNCTION public.get_current_user_deliberation_ids_auth()
RETURNS TABLE(deliberation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.deliberation_id
  FROM participants p
  WHERE p.user_id = (auth.uid())::text;
$$;

CREATE OR REPLACE FUNCTION public.is_user_participant_in_deliberation_auth(deliberation_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM participants 
    WHERE deliberation_id = deliberation_uuid 
    AND user_id = (auth.uid())::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_facilitator_of_deliberation_auth(deliberation_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM deliberations 
    WHERE id = deliberation_uuid 
    AND facilitator_id = (auth.uid())::text
  );
$$;

-- 13. Update admin functions to use Supabase Auth
CREATE OR REPLACE FUNCTION public.get_admin_system_stats_auth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin_user boolean := false;
  total_users integer := 0;
  total_deliberations integer := 0;
  total_messages integer := 0;
  active_deliberations integer := 0;
  total_access_codes integer := 0;
  used_access_codes integer := 0;
BEGIN
  -- Check if current user is admin using Supabase Auth
  SELECT auth_is_admin() INTO is_admin_user;
  
  -- If not admin, return error
  IF NOT is_admin_user THEN
    RETURN jsonb_build_object('error', 'Admin access required');
  END IF;
  
  -- Get counts directly (bypassing RLS since this is a SECURITY DEFINER function)
  SELECT COUNT(*) INTO total_users FROM profiles;
  SELECT COUNT(*) INTO total_deliberations FROM deliberations;
  SELECT COUNT(*) INTO total_messages FROM messages;
  SELECT COUNT(*) INTO active_deliberations FROM deliberations WHERE status = 'active';
  SELECT COUNT(*) INTO total_access_codes FROM access_codes;
  SELECT COUNT(*) INTO used_access_codes FROM access_codes WHERE is_used = true;
  
  RETURN jsonb_build_object(
    'totalUsers', total_users,
    'totalDeliberations', total_deliberations,
    'totalMessages', total_messages,
    'activeDeliberations', active_deliberations,
    'totalAccessCodes', total_access_codes,
    'usedAccessCodes', used_access_codes
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- 14. Clean up obsolete access code functions
DROP FUNCTION IF EXISTS public.get_current_access_code_user();
DROP FUNCTION IF EXISTS public.get_current_user_access_code();
DROP FUNCTION IF EXISTS public.get_current_user_id_clean();
DROP FUNCTION IF EXISTS public.is_current_user_admin();
DROP FUNCTION IF EXISTS public.get_admin_system_stats();

COMMENT ON SCHEMA public IS 'Auth system overhauled to use Supabase Auth exclusively';