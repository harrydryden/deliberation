-- Enable the vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledge management tables
CREATE TABLE public.agent_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agent_configurations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('text', 'pdf')),
  file_name TEXT,
  file_size INTEGER,
  chunk_index INTEGER DEFAULT 0,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Create policies for agent knowledge
CREATE POLICY "Admin users can manage all knowledge" 
ON agent_knowledge 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'user_role' = 'admin'
  )
);

-- Create indexes for better performance
CREATE INDEX idx_agent_knowledge_agent_id ON agent_knowledge(agent_id);
CREATE INDEX idx_agent_knowledge_content_type ON agent_knowledge(content_type);
CREATE INDEX idx_agent_knowledge_embedding ON agent_knowledge USING ivfflat (embedding vector_cosine_ops);

-- Create function for automatic timestamp updates
CREATE TRIGGER update_agent_knowledge_updated_at
BEFORE UPDATE ON public.agent_knowledge
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();