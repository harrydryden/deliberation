-- Security hardening: Add RLS policies for agent configurations and prompt templates

-- Enable RLS on agent_configurations if not already enabled
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for agent_configurations - only authenticated users can view
CREATE POLICY "Users can view agent configurations" 
ON public.agent_configurations 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Add RLS policy for agent_configurations - only admins can modify
CREATE POLICY "Admins can modify agent configurations" 
ON public.agent_configurations 
FOR ALL 
USING (is_authenticated_admin());

-- Enable RLS on prompt_templates if not already enabled  
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for prompt_templates - only authenticated users can view
CREATE POLICY "Users can view prompt templates" 
ON public.prompt_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Add RLS policy for prompt_templates - only admins can modify
CREATE POLICY "Admins can modify prompt templates" 
ON public.prompt_templates 
FOR ALL 
USING (is_authenticated_admin());