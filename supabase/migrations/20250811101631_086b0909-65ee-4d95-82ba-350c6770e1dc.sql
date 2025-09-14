-- Create table for storing IBIS node ratings
CREATE TABLE public.ibis_node_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ibis_node_id UUID NOT NULL,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)), -- -1 for thumbs down, 1 for thumbs up
  deliberation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure unique rating per user per node per message
  UNIQUE(ibis_node_id, message_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.ibis_node_ratings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create ratings in deliberations they participate in"
ON public.ibis_node_ratings
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND 
  is_participant_in_deliberation(deliberation_id, auth.uid())
);

CREATE POLICY "Users can update their own ratings"
ON public.ibis_node_ratings
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view ratings in deliberations they participate in"
ON public.ibis_node_ratings
FOR SELECT
USING (is_participant_in_deliberation(deliberation_id, auth.uid()));

-- Create index for performance
CREATE INDEX idx_ibis_node_ratings_node_message ON public.ibis_node_ratings(ibis_node_id, message_id);
CREATE INDEX idx_ibis_node_ratings_user ON public.ibis_node_ratings(user_id);
CREATE INDEX idx_ibis_node_ratings_deliberation ON public.ibis_node_ratings(deliberation_id);