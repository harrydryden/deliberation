-- Create ibis_relationships table for enhanced node connections
CREATE TABLE IF NOT EXISTS ibis_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES ibis_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES ibis_nodes(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('supports', 'challenges', 'elaborates', 'questions', 'responds_to', 'similar_to', 'contrasts_with')),
  strength DECIMAL(3,2) NOT NULL DEFAULT 0.5 CHECK (strength >= 0.0 AND strength <= 1.0),
  semantic_similarity DECIMAL(3,2),
  user_created BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deliberation_id UUID NOT NULL REFERENCES deliberations(id) ON DELETE CASCADE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_node_id, target_node_id, relationship_type)
);

-- Create basic indexes
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_source_node ON ibis_relationships(source_node_id);
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_target_node ON ibis_relationships(target_node_id);
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_type ON ibis_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_deliberation ON ibis_relationships(deliberation_id);

-- Enable RLS
ALTER TABLE ibis_relationships ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
CREATE POLICY "Users can view relationships in their deliberations" ON ibis_relationships
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p 
      WHERE p.deliberation_id = ibis_relationships.deliberation_id 
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create relationships in their deliberations" ON ibis_relationships
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p 
      WHERE p.deliberation_id = ibis_relationships.deliberation_id 
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update relationships they created" ON ibis_relationships
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Admins can manage all relationships" ON ibis_relationships
  FOR ALL USING (auth_is_admin());

-- Simple function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ibis_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_ibis_relationships_updated_at
  BEFORE UPDATE ON ibis_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_ibis_relationships_updated_at();

-- Basic function to get node relationships
CREATE OR REPLACE FUNCTION get_node_relationships(node_uuid UUID)
RETURNS TABLE(
  relationship_id UUID,
  related_node_id UUID,
  relationship_type VARCHAR(50),
  strength DECIMAL(3,2),
  semantic_similarity DECIMAL(3,2),
  related_node_title TEXT,
  related_node_type VARCHAR(50),
  is_source BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id as relationship_id,
    CASE 
      WHEN r.source_node_id = node_uuid THEN r.target_node_id
      ELSE r.source_node_id
    END as related_node_id,
    r.relationship_type,
    r.strength,
    r.semantic_similarity,
    n.title as related_node_title,
    n.node_type as related_node_type,
    (r.source_node_id = node_uuid) as is_source
  FROM ibis_relationships r
  JOIN ibis_nodes n ON (
    CASE 
      WHEN r.source_node_id = node_uuid THEN r.target_node_id
      ELSE r.source_node_id
    END = n.id
  )
  WHERE r.source_node_id = node_uuid OR r.target_node_id = node_uuid
  ORDER BY r.strength DESC, r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
