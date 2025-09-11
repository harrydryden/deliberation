-- Create table for analysis metrics and circuit breaker state
CREATE TABLE IF NOT EXISTS public.analysis_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type text NOT NULL,
  model_used text,
  success boolean NOT NULL,
  duration_ms integer,
  error_message text,
  deliberation_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for circuit breaker state
CREATE TABLE IF NOT EXISTS public.circuit_breaker_state (
  id text NOT NULL PRIMARY KEY,
  failure_count integer NOT NULL DEFAULT 0,
  last_failure_time timestamp with time zone,
  is_open boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analysis_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- Create policies for analysis metrics
CREATE POLICY "Service role can manage analysis metrics" 
ON public.analysis_metrics 
FOR ALL 
USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can view analysis metrics" 
ON public.analysis_metrics 
FOR SELECT 
USING (auth_is_admin());

-- Create policies for circuit breaker state
CREATE POLICY "Service role can manage circuit breaker state" 
ON public.circuit_breaker_state 
FOR ALL 
USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can view circuit breaker state" 
ON public.circuit_breaker_state 
FOR SELECT 
USING (auth_is_admin());

-- Create indexes for performance
CREATE INDEX idx_analysis_metrics_created_at ON public.analysis_metrics(created_at DESC);
CREATE INDEX idx_analysis_metrics_success ON public.analysis_metrics(success);
CREATE INDEX idx_circuit_breaker_updated_at ON public.circuit_breaker_state(updated_at);