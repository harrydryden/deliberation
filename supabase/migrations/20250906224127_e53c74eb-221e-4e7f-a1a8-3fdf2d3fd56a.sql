-- Add bulk import status to messages table
ALTER TABLE messages ADD COLUMN bulk_import_status TEXT CHECK (bulk_import_status IN ('imported', 'awaiting_agent_response', 'agent_response_generated', 'failed')) DEFAULT NULL;

-- Create bulk import batches table for tracking
CREATE TABLE bulk_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliberation_id UUID NOT NULL REFERENCES deliberations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Batch metadata
  filename TEXT NOT NULL,
  total_messages INTEGER NOT NULL DEFAULT 0,
  imported_messages INTEGER NOT NULL DEFAULT 0,
  processed_messages INTEGER NOT NULL DEFAULT 0,
  failed_messages INTEGER NOT NULL DEFAULT 0,
  
  -- Status tracking
  import_status TEXT NOT NULL DEFAULT 'pending' CHECK (import_status IN ('pending', 'importing', 'imported', 'processing_agents', 'completed', 'failed')),
  processing_status TEXT NOT NULL DEFAULT 'not_started' CHECK (processing_status IN ('not_started', 'in_progress', 'paused', 'completed', 'failed')),
  
  -- Error tracking
  error_details JSONB DEFAULT '{}',
  processing_log JSONB DEFAULT '[]'
);

-- Enable RLS on bulk_import_batches table
ALTER TABLE bulk_import_batches ENABLE ROW LEVEL SECURITY;

-- Admin can manage all batches
CREATE POLICY "Admins can manage all import batches" ON bulk_import_batches
  FOR ALL USING (auth_is_admin());

-- Users can view batches they created or for deliberations they participate in
CREATE POLICY "Users can view relevant import batches" ON bulk_import_batches
  FOR SELECT USING (
    created_by = auth.uid() OR 
    deliberation_id IN (SELECT deliberation_id FROM participants WHERE user_id = auth.uid()::text)
  );

-- Add updated_at trigger for bulk_import_batches
CREATE TRIGGER update_bulk_import_batches_updated_at
  BEFORE UPDATE ON bulk_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for performance
CREATE INDEX idx_bulk_import_batches_deliberation_id ON bulk_import_batches(deliberation_id);
CREATE INDEX idx_bulk_import_batches_status ON bulk_import_batches(import_status, processing_status);
CREATE INDEX idx_messages_bulk_import_status ON messages(bulk_import_status) WHERE bulk_import_status IS NOT NULL;