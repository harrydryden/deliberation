-- Comprehensive migration to update all authentication functions to use access code format
-- This replaces all auth.uid() references with get_current_access_code_user() throughout the system

-- 1. Update all RLS policies on profiles table
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view non-archived profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles including archived" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can archive profiles" ON profiles;

CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
WITH CHECK (id = get_current_access_code_user());

CREATE POLICY "Users can update their own profile" 
ON profiles FOR UPDATE 
USING (id = get_current_access_code_user())
WITH CHECK (id = get_current_access_code_user());

CREATE POLICY "Users can view their own profile" 
ON profiles FOR SELECT 
USING (id = get_current_access_code_user());

CREATE POLICY "Users can view non-archived profiles" 
ON profiles FOR SELECT 
USING ((NOT is_archived) OR (is_archived IS NULL));

CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (is_admin_access_code_user());

CREATE POLICY "Admins can view all profiles including archived" 
ON profiles FOR SELECT 
USING (get_current_user_role() = 'admin');

CREATE POLICY "Admins can update any profile" 
ON profiles FOR UPDATE 
USING (get_current_user_role() = 'admin')
WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "Admins can archive profiles" 
ON profiles FOR UPDATE 
USING (get_current_user_role() = 'admin')
WITH CHECK (get_current_user_role() = 'admin');

-- 2. Update all RLS policies on deliberations table
DROP POLICY IF EXISTS "Users can view deliberations they participate in" ON deliberations;
DROP POLICY IF EXISTS "Facilitators can update their deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can create deliberations" ON deliberations;
DROP POLICY IF EXISTS "Admins can delete deliberations" ON deliberations;

CREATE POLICY "Users can view deliberations they participate in" 
ON deliberations FOR SELECT 
USING (
  (is_public = true) OR 
  (facilitator_id = get_current_access_code_user()) OR 
  (EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.deliberation_id = deliberations.id 
    AND p.user_id = get_current_access_code_user()
  )) OR 
  is_admin_access_code_user()
);

CREATE POLICY "Facilitators can update their deliberations" 
ON deliberations FOR UPDATE 
USING ((get_current_access_code_user() = facilitator_id) OR is_admin_access_code_user());

CREATE POLICY "Admins can create deliberations" 
ON deliberations FOR INSERT 
WITH CHECK (is_admin_access_code_user());

CREATE POLICY "Admins can delete deliberations" 
ON deliberations FOR DELETE 
USING (is_admin_access_code_user());

-- 3. Update all RLS policies on participants table
DROP POLICY IF EXISTS "Anyone can join as participant" ON participants;
DROP POLICY IF EXISTS "Authenticated can view participants" ON participants;
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON participants;

CREATE POLICY "Anyone can join as participant" 
ON participants FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated can view participants" 
ON participants FOR SELECT 
USING (get_current_access_code_user() IS NOT NULL);

CREATE POLICY "Users can view participants in their deliberations" 
ON participants FOR SELECT 
USING (user_participates_in_deliberation(deliberation_id, get_current_access_code_user()) OR is_admin_access_code_user());

CREATE POLICY "Users can leave deliberations" 
ON participants FOR DELETE 
USING (true);

-- 4. Update all RLS policies on ibis_nodes table
DROP POLICY IF EXISTS "Users can view IBIS nodes in their deliberations" ON ibis_nodes;
DROP POLICY IF EXISTS "Participants can create IBIS nodes" ON ibis_nodes;
DROP POLICY IF EXISTS "Admins can create IBIS nodes" ON ibis_nodes;
DROP POLICY IF EXISTS "Admins can update all IBIS nodes" ON ibis_nodes;
DROP POLICY IF EXISTS "Admins can delete IBIS nodes" ON ibis_nodes;

CREATE POLICY "Users can view IBIS nodes in their deliberations" 
ON ibis_nodes FOR SELECT 
USING (
  (EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.deliberation_id = ibis_nodes.deliberation_id 
    AND p.user_id = get_current_access_code_user()
  )) OR 
  is_admin_access_code_user()
);

CREATE POLICY "Participants can create IBIS nodes" 
ON ibis_nodes FOR INSERT 
WITH CHECK (
  (created_by = get_current_access_code_user()) AND 
  is_participant_in_deliberation(deliberation_id, get_current_access_code_user())
);

CREATE POLICY "Admins can create IBIS nodes" 
ON ibis_nodes FOR INSERT 
WITH CHECK (is_admin_access_code_user());

CREATE POLICY "Admins can update all IBIS nodes" 
ON ibis_nodes FOR UPDATE 
USING (is_admin_access_code_user());

CREATE POLICY "Admins can delete IBIS nodes" 
ON ibis_nodes FOR DELETE 
USING (is_admin_access_code_user());

-- 5. Update all RLS policies on ibis_relationships table
DROP POLICY IF EXISTS "Users can view IBIS relationships in their deliberations" ON ibis_relationships;
DROP POLICY IF EXISTS "Participants can create relationships" ON ibis_relationships;
DROP POLICY IF EXISTS "Admins can create IBIS relationships" ON ibis_relationships;
DROP POLICY IF EXISTS "Admins can update IBIS relationships" ON ibis_relationships;
DROP POLICY IF EXISTS "Admins can delete IBIS relationships" ON ibis_relationships;

CREATE POLICY "Users can view IBIS relationships in their deliberations" 
ON ibis_relationships FOR SELECT 
USING (
  (EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.deliberation_id = ibis_relationships.deliberation_id 
    AND p.user_id = get_current_access_code_user()
  )) OR 
  is_admin_access_code_user()
);

CREATE POLICY "Participants can create relationships" 
ON ibis_relationships FOR INSERT 
WITH CHECK (
  (created_by = get_current_access_code_user()) AND 
  (EXISTS (
    SELECT 1 FROM participants 
    WHERE deliberation_id = ibis_relationships.deliberation_id 
    AND user_id = get_current_access_code_user()
  ))
);

CREATE POLICY "Admins can create IBIS relationships" 
ON ibis_relationships FOR INSERT 
WITH CHECK (is_admin_access_code_user());

CREATE POLICY "Admins can update IBIS relationships" 
ON ibis_relationships FOR UPDATE 
USING (is_admin_access_code_user());

CREATE POLICY "Admins can delete IBIS relationships" 
ON ibis_relationships FOR DELETE 
USING (is_admin_access_code_user());

-- 6. Update all RLS policies on ibis_node_ratings table
DROP POLICY IF EXISTS "Users can view ratings in deliberations they participate in" ON ibis_node_ratings;
DROP POLICY IF EXISTS "Users can create ratings in deliberations they participate in" ON ibis_node_ratings;
DROP POLICY IF EXISTS "Users can update their own ratings" ON ibis_node_ratings;

CREATE POLICY "Users can view ratings in deliberations they participate in" 
ON ibis_node_ratings FOR SELECT 
USING (is_participant_in_deliberation(deliberation_id, get_current_access_code_user()));

CREATE POLICY "Users can create ratings in deliberations they participate in" 
ON ibis_node_ratings FOR INSERT 
WITH CHECK (
  (user_id = get_current_access_code_user()) AND 
  is_participant_in_deliberation(deliberation_id, get_current_access_code_user())
);

CREATE POLICY "Users can update their own ratings" 
ON ibis_node_ratings FOR UPDATE 
USING (user_id = get_current_access_code_user())
WITH CHECK (user_id = get_current_access_code_user());

-- 7. Update all RLS policies on submissions table
DROP POLICY IF EXISTS "Users can view submissions in deliberations they participate in" ON submissions;
DROP POLICY IF EXISTS "Users can create their own submissions" ON submissions;
DROP POLICY IF EXISTS "Users can update their own submissions" ON submissions;

CREATE POLICY "Users can view submissions in deliberations they participate in" 
ON submissions FOR SELECT 
USING (is_participant_in_deliberation(deliberation_id, get_current_access_code_user()));

CREATE POLICY "Users can create their own submissions" 
ON submissions FOR INSERT 
WITH CHECK (
  (get_current_access_code_user() = user_id) AND 
  is_participant_in_deliberation(deliberation_id, get_current_access_code_user())
);

CREATE POLICY "Users can update their own submissions" 
ON submissions FOR UPDATE 
USING (get_current_access_code_user() = user_id)
WITH CHECK (get_current_access_code_user() = user_id);

-- 8. Update all RLS policies on classified_items table
DROP POLICY IF EXISTS "Users can view classified items in deliberations they participa" ON classified_items;
DROP POLICY IF EXISTS "Users can create classified items from their submissions" ON classified_items;
DROP POLICY IF EXISTS "Users can update their own classified items" ON classified_items;

CREATE POLICY "Users can view classified items in deliberations they participate in" 
ON classified_items FOR SELECT 
USING (is_participant_in_deliberation(deliberation_id, get_current_access_code_user()));

CREATE POLICY "Users can create classified items from their submissions" 
ON classified_items FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM submissions 
    WHERE id = classified_items.submission_id 
    AND user_id = get_current_access_code_user()
  )
);

CREATE POLICY "Users can update their own classified items" 
ON classified_items FOR UPDATE 
USING (get_current_access_code_user() = created_by)
WITH CHECK (get_current_access_code_user() = created_by);

-- 9. Update all RLS policies on item_keywords table
DROP POLICY IF EXISTS "Users can manage keywords for their items" ON item_keywords;
DROP POLICY IF EXISTS "Users can view item keywords for accessible items" ON item_keywords;

CREATE POLICY "Users can manage keywords for their items" 
ON item_keywords FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM classified_items ci 
    WHERE ci.id = item_keywords.classified_item_id 
    AND ci.created_by = get_current_access_code_user()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM classified_items ci 
    WHERE ci.id = item_keywords.classified_item_id 
    AND ci.created_by = get_current_access_code_user()
  )
);

CREATE POLICY "Users can view item keywords for accessible items" 
ON item_keywords FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM classified_items ci 
    WHERE ci.id = item_keywords.classified_item_id 
    AND is_participant_in_deliberation(ci.deliberation_id, get_current_access_code_user())
  )
);

-- 10. Update all RLS policies on item_relationships table
DROP POLICY IF EXISTS "Users can view relationships for accessible items" ON item_relationships;
DROP POLICY IF EXISTS "Users can create relationships between accessible items" ON item_relationships;

CREATE POLICY "Users can view relationships for accessible items" 
ON item_relationships FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM classified_items ci1, classified_items ci2 
    WHERE ci1.id = item_relationships.source_item_id 
    AND ci2.id = item_relationships.target_item_id 
    AND is_participant_in_deliberation(ci1.deliberation_id, get_current_access_code_user()) 
    AND is_participant_in_deliberation(ci2.deliberation_id, get_current_access_code_user())
  )
);

CREATE POLICY "Users can create relationships between accessible items" 
ON item_relationships FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM classified_items ci1, classified_items ci2 
    WHERE ci1.id = item_relationships.source_item_id 
    AND ci2.id = item_relationships.target_item_id 
    AND is_participant_in_deliberation(ci1.deliberation_id, get_current_access_code_user()) 
    AND is_participant_in_deliberation(ci2.deliberation_id, get_current_access_code_user())
  )
);

-- 11. Update all RLS policies on item_similarities table
DROP POLICY IF EXISTS "Users can view similarities for accessible items" ON item_similarities;

CREATE POLICY "Users can view similarities for accessible items" 
ON item_similarities FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM classified_items ci1, classified_items ci2 
    WHERE ci1.id = item_similarities.item1_id 
    AND ci2.id = item_similarities.item2_id 
    AND is_participant_in_deliberation(ci1.deliberation_id, get_current_access_code_user()) 
    AND is_participant_in_deliberation(ci2.deliberation_id, get_current_access_code_user())
  )
);

-- 12. Update all RLS policies on facilitator_sessions table
DROP POLICY IF EXISTS "Users can view their own facilitator sessions" ON facilitator_sessions;
DROP POLICY IF EXISTS "Users can create their own facilitator sessions" ON facilitator_sessions;
DROP POLICY IF EXISTS "Users can update their own facilitator sessions" ON facilitator_sessions;
DROP POLICY IF EXISTS "Admins can view all facilitator sessions" ON facilitator_sessions;

CREATE POLICY "Users can view their own facilitator sessions" 
ON facilitator_sessions FOR SELECT 
USING (user_id = get_current_access_code_user());

CREATE POLICY "Users can create their own facilitator sessions" 
ON facilitator_sessions FOR INSERT 
WITH CHECK (user_id = get_current_access_code_user());

CREATE POLICY "Users can update their own facilitator sessions" 
ON facilitator_sessions FOR UPDATE 
USING (user_id = get_current_access_code_user())
WITH CHECK (user_id = get_current_access_code_user());

CREATE POLICY "Admins can view all facilitator sessions" 
ON facilitator_sessions FOR SELECT 
USING (is_admin_access_code_user());

-- 13. Update all RLS policies on agent_interactions table
DROP POLICY IF EXISTS "Users can view agent interactions in their deliberations" ON agent_interactions;
DROP POLICY IF EXISTS "Authenticated admins can view all agent interactions" ON agent_interactions;

CREATE POLICY "Users can view agent interactions in their deliberations" 
ON agent_interactions FOR SELECT 
USING (
  (EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.deliberation_id = agent_interactions.deliberation_id 
    AND p.user_id = get_current_access_code_user()
  )) OR 
  is_admin_access_code_user()
);

CREATE POLICY "Authenticated admins can view all agent interactions" 
ON agent_interactions FOR SELECT 
USING (is_admin_access_code_user());

-- 14. Update all RLS policies on agent_configurations table
DROP POLICY IF EXISTS "Anyone can read default agent configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Authenticated users can read configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Participants can read agent configurations for their deliberati" ON agent_configurations;
DROP POLICY IF EXISTS "Admins can create agent configurations" ON agent_configurations;
DROP POLICY IF EXISTS "Admins can delete agent configurations" ON agent_configurations;

CREATE POLICY "Anyone can read default agent configurations" 
ON agent_configurations FOR SELECT 
USING (is_default = true);

CREATE POLICY "Authenticated users can read configurations" 
ON agent_configurations FOR SELECT 
USING (get_current_access_code_user() IS NOT NULL);

CREATE POLICY "Participants can read agent configurations for their deliberations" 
ON agent_configurations FOR SELECT 
USING (
  (deliberation_id IS NOT NULL) AND 
  (EXISTS (
    SELECT 1 FROM participants 
    WHERE deliberation_id = agent_configurations.deliberation_id 
    AND user_id = get_current_access_code_user()
  ))
);

CREATE POLICY "Admins can create agent configurations" 
ON agent_configurations FOR INSERT 
WITH CHECK (is_admin_access_code_user());

CREATE POLICY "Admins can delete agent configurations" 
ON agent_configurations FOR DELETE 
USING (is_admin_access_code_user());

-- 15. Update all RLS policies on file_processing_logs table
DROP POLICY IF EXISTS "Users can view their own file processing logs" ON file_processing_logs;

CREATE POLICY "Users can view their own file processing logs" 
ON file_processing_logs FOR SELECT 
USING ((get_current_access_code_user() = user_id) OR is_admin_access_code_user());

-- 16. Update all RLS policies on user_sessions table
DROP POLICY IF EXISTS "Users can view their own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON user_sessions;

CREATE POLICY "Users can view their own sessions" 
ON user_sessions FOR SELECT 
USING (get_current_access_code_user() = user_id);

CREATE POLICY "Users can update their own sessions" 
ON user_sessions FOR UPDATE 
USING (get_current_access_code_user() = user_id);

-- 17. Update database functions that use auth.uid()
-- Update audit triggers
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        PERFORM audit_sensitive_operation(
            'role_change',
            'profiles',
            NEW.id,
            jsonb_build_object(
                'old_role', OLD.role,
                'new_role', NEW.role,
                'changed_by', get_current_access_code_user()
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.audit_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Log the user deletion with all profile information
    PERFORM audit_sensitive_operation(
        'user_deleted',
        'profiles',
        OLD.id,
        jsonb_build_object(
            'deleted_user_role', OLD.role,
            'deleted_display_name', OLD.display_name,
            'deleted_by', get_current_access_code_user()
        )
    );
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Update validation functions
CREATE OR REPLACE FUNCTION public.validate_role_change(target_user_id uuid, new_role text, current_user_role text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_role text;
    requesting_user_role text;
BEGIN
    -- Get the current user's role  
    SELECT role INTO requesting_user_role 
    FROM public.profiles 
    WHERE id = get_current_access_code_user();
    
    -- Get target user's current role
    SELECT role INTO current_role 
    FROM public.profiles 
    WHERE id = target_user_id;
    
    -- Only admins can change roles
    IF requesting_user_role != 'admin' THEN
        RETURN false;
    END IF;
    
    -- Prevent self-demotion (admin removing their own admin role)
    IF target_user_id = get_current_access_code_user() AND current_role = 'admin' AND new_role != 'admin' THEN
        RETURN false;
    END IF;
    
    -- Validate role is in allowed list
    IF new_role NOT IN ('admin', 'user', 'moderator') THEN
        RETURN false;
    END IF;
    
    -- Log role change attempt
    PERFORM audit_sensitive_operation(
        'role_change_validation',
        'profiles',
        target_user_id,
        jsonb_build_object(
            'old_role', current_role,
            'new_role', new_role,
            'requested_by', get_current_access_code_user(),
            'approved', true
        )
    );
    
    RETURN true;
END;
$$;

-- Update privilege escalation function  
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation_enhanced()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role text;
    admin_count integer;
BEGIN
    -- Get current user's role
    SELECT role INTO current_user_role FROM profiles WHERE id = get_current_access_code_user();
    
    -- Check if role is being changed
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Only admins can change roles
        IF current_user_role != 'admin' THEN
            INSERT INTO security_events (event_type, user_id, details, risk_level)
            VALUES ('unauthorized_role_change_attempt', get_current_access_code_user(), 
                    jsonb_build_object(
                        'target_user', NEW.id,
                        'old_role', OLD.role,
                        'new_role', NEW.role
                    ), 'critical');
            
            RAISE EXCEPTION 'Unauthorized role change attempt';
        END IF;
        
        -- Prevent self-demotion if it would leave no admins
        IF get_current_access_code_user() = NEW.id AND OLD.role = 'admin' AND NEW.role != 'admin' THEN
            SELECT COUNT(*) INTO admin_count 
            FROM profiles 
            WHERE role = 'admin' AND id != get_current_access_code_user();
            
            IF admin_count < 1 THEN
                INSERT INTO security_events (event_type, user_id, details, risk_level)
                VALUES ('admin_self_demotion_prevented', get_current_access_code_user(), 
                        jsonb_build_object('reason', 'would_leave_no_admins'), 'high');
                
                RAISE EXCEPTION 'Cannot remove last admin user';
            END IF;
        END IF;
        
        -- Log successful role change
        INSERT INTO security_events (event_type, user_id, details, risk_level)
        VALUES ('role_changed', get_current_access_code_user(), 
                jsonb_build_object(
                    'target_user', NEW.id,
                    'old_role', OLD.role,
                    'new_role', NEW.role
                ), 'medium');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Update enhanced audit log function
CREATE OR REPLACE FUNCTION public.enhanced_audit_log(operation_type text, table_name text DEFAULT NULL::text, record_id uuid DEFAULT NULL::uuid, details jsonb DEFAULT NULL::jsonb, risk_level text DEFAULT 'low'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        new_values,
        ip_address,
        user_agent,
        created_at
    ) VALUES (
        get_current_access_code_user(),
        operation_type,
        table_name,
        record_id,
        details || jsonb_build_object('risk_level', risk_level),
        inet_client_addr(),
        current_setting('request.headers', true)::json->>'user-agent',
        now()
    );
    
    -- For high-risk operations, also log to a separate security events table
    IF risk_level IN ('high', 'critical') THEN
        -- Could extend to send alerts or notifications
        RAISE NOTICE 'High-risk security event logged: %', operation_type;
    END IF;
END;
$$;

-- Update log admin action function
CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_table_name text DEFAULT NULL::text, p_record_id uuid DEFAULT NULL::uuid, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values
    ) VALUES (
        get_current_access_code_user(),
        p_action,
        p_table_name,
        p_record_id,
        p_old_values,
        p_new_values
    );
END;
$$;

-- Update audit sensitive operation function
CREATE OR REPLACE FUNCTION public.audit_sensitive_operation(operation_type text, table_name text, record_id uuid DEFAULT NULL::uuid, details jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    ip_address
  ) VALUES (
    get_current_access_code_user(),
    operation_type,
    table_name,
    record_id,
    details,
    inet_client_addr()
  );
END;
$$;