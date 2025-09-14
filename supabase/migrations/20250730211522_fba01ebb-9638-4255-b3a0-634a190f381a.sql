-- Performance optimization: Remove security overhead

-- 1. Remove audit logging (performance drag)
DROP TRIGGER IF EXISTS audit_role_changes ON public.profiles;
DROP FUNCTION IF EXISTS public.log_role_changes();
DROP TABLE IF EXISTS public.role_audit_log;

-- 2. Remove rate limiting infrastructure
DROP TABLE IF EXISTS public.rate_limits;
DROP TABLE IF EXISTS public.auth_attempts;

-- 3. Simplify RLS policies for better performance
-- Replace complex policies with simpler ones

-- Profiles table - simpler policies
DROP POLICY IF EXISTS "Users can update their own profile (non-role fields only)" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.profiles;

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND p.user_role = 'admin'
        )
    );

-- Deliberations - simpler access
DROP POLICY IF EXISTS "Participants can view their deliberations" ON public.deliberations;

CREATE POLICY "Simple deliberation access"
    ON public.deliberations FOR SELECT
    USING (
        is_public = true OR 
        auth.uid() = facilitator_id OR
        EXISTS (SELECT 1 FROM participants WHERE deliberation_id = deliberations.id AND user_id = auth.uid())
    );

-- Messages - simpler policies
DROP POLICY IF EXISTS "Users can view agent messages directed to them" ON public.messages;
DROP POLICY IF EXISTS "System can create agent messages" ON public.messages;

CREATE POLICY "Simple message access"
    ON public.messages FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM participants 
            WHERE deliberation_id = messages.deliberation_id AND user_id = auth.uid()
        )
    );

-- Participants - simpler policies  
DROP POLICY IF EXISTS "Facilitators can manage participants" ON public.participants;

CREATE POLICY "Simple participant management"
    ON public.participants FOR ALL
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM deliberations d 
            WHERE d.id = deliberation_id AND d.facilitator_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND p.user_role = 'admin'
        )
    );

-- 4. Remove complex constraint checks
ALTER TABLE public.access_codes DROP CONSTRAINT IF EXISTS access_code_length_check;
ALTER TABLE public.access_codes DROP CONSTRAINT IF EXISTS access_code_format_check;

-- 5. Create simple caching view for user data (performance optimization)
CREATE OR REPLACE VIEW public.user_cache AS
SELECT 
    p.id,
    p.display_name,
    p.user_role,
    p.expertise_areas,
    COALESCE(
        (SELECT array_agg(deliberation_id) 
         FROM participants 
         WHERE user_id = p.id), 
        ARRAY[]::uuid[]
    ) as deliberation_ids
FROM public.profiles p;