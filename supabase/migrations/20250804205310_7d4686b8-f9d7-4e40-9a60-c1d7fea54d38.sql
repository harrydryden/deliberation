-- Create table for IBIS node relationships
CREATE TABLE IF NOT EXISTS public.ibis_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_node_id UUID NOT NULL,
  target_node_id UUID NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('supports', 'opposes', 'relates_to', 'responds_to')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  deliberation_id UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.ibis_relationships ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Participants can view relationships in their deliberations" 
ON public.ibis_relationships 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = ibis_relationships.deliberation_id 
    AND participants.user_id = auth.uid()
  )
);

CREATE POLICY "Participants can create relationships" 
ON public.ibis_relationships 
FOR INSERT 
WITH CHECK (
  created_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = ibis_relationships.deliberation_id 
    AND participants.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_ibis_relationships_source ON public.ibis_relationships(source_node_id);
CREATE INDEX idx_ibis_relationships_target ON public.ibis_relationships(target_node_id);
CREATE INDEX idx_ibis_relationships_deliberation ON public.ibis_relationships(deliberation_id);