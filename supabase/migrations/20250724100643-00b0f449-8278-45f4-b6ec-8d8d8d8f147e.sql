-- Add preset_questions column to agent_configurations table
ALTER TABLE public.agent_configurations 
ADD COLUMN preset_questions JSONB DEFAULT '[]'::jsonb;