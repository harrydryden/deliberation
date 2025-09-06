-- Create user activity logs table for real-time activity tracking
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  deliberation_id UUID REFERENCES public.deliberations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('message_sent', 'message_viewed', 'ibis_submission', 'voice_interaction', 'proactive_response', 'page_focus', 'rating_given')),
  activity_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_session_id ON public.user_activity_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_deliberation_id ON public.user_activity_logs(deliberation_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON public.user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON public.user_activity_logs(created_at);

-- Enable RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own activity logs
CREATE POLICY "Users can view their own activity logs" ON public.user_activity_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own activity logs
CREATE POLICY "Users can insert their own activity logs" ON public.user_activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can manage all activity logs
CREATE POLICY "Admins can manage all activity logs" ON public.user_activity_logs
  FOR ALL USING (auth_is_admin());