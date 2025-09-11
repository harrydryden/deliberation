-- Create simple login events table
CREATE TABLE public.login_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

-- Create policies for login events
CREATE POLICY "Users can view their own login events" 
ON public.login_events 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own login events" 
ON public.login_events 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX idx_login_events_user_id_login_at ON public.login_events(user_id, login_at DESC);

-- Drop the complex user_sessions table and related tables
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.user_activity_logs CASCADE;