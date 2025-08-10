-- Add embeddings to IBIS nodes for semantic clustering (OpenAI 1536-dim compatible)
ALTER TABLE public.ibis_nodes
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ANN index for fast similarity search/orderings
CREATE INDEX IF NOT EXISTS idx_ibis_nodes_embedding_ivfflat
ON public.ibis_nodes
USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);

COMMENT ON COLUMN public.ibis_nodes.embedding IS '1536-dim embedding for semantic clustering of Issues/IBIS nodes';