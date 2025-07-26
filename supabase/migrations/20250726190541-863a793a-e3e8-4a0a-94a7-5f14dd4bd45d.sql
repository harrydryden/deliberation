-- Fix RLS policies to require authentication
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can manage all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can view all participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can manage all participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all agent interactions" ON public.agent_interactions;

-- Create properly scoped admin policies
CREATE POLICY "Authenticated admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated 
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Authenticated admins can view all deliberations" ON public.deliberations
  FOR SELECT TO authenticated 
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Authenticated admins can manage all deliberations" ON public.deliberations
  FOR ALL TO authenticated 
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Authenticated admins can view all participants" ON public.participants
  FOR SELECT TO authenticated 
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Authenticated admins can manage all participants" ON public.participants
  FOR ALL TO authenticated 
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Authenticated admins can view all messages" ON public.messages
  FOR SELECT TO authenticated 
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Authenticated admins can view all agent interactions" ON public.agent_interactions
  FOR SELECT TO authenticated 
  USING (public.is_admin_user(auth.uid()));