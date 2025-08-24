-- Create ibis_relationships table for enhanced node connections
CREATE TABLE IF NOT EXISTS ibis_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES ibis_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES ibis_nodes(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('supports', 'challenges', 'elaborates', 'questions', 'responds_to', 'similar_to', 'contrasts_with')),
  strength DECIMAL(3,2) NOT NULL DEFAULT 0.5 CHECK (strength >= 0.0 AND strength <= 1.0), -- Relationship strength (0.0 to 1.0)
  semantic_similarity DECIMAL(3,2), -- AI-calculated semantic similarity
  user_created BOOLEAN NOT NULL DEFAULT false, -- Whether relationship was manually created
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deliberation_id UUID NOT NULL REFERENCES deliberations(id) ON DELETE CASCADE,
  metadata JSONB, -- Additional relationship metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_node_id, target_node_id, relationship_type) -- Prevent duplicate relationships
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_source_node ON ibis_relationships(source_node_id);
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_target_node ON ibis_relationships(target_node_id);
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_type ON ibis_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_deliberation ON ibis_relationships(deliberation_id);
-- Note: semantic_similarity index will be created after the table is created

-- Enable RLS
ALTER TABLE ibis_relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view relationships in their deliberations" ON ibis_relationships
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM deliberation_participants dp 
      WHERE dp.deliberation_id = ibis_relationships.deliberation_id 
      AND dp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create relationships in their deliberations" ON ibis_relationships
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM deliberation_participants dp 
      WHERE dp.deliberation_id = ibis_relationships.deliberation_id 
      AND dp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update relationships they created" ON ibis_relationships
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Admins can manage all relationships" ON ibis_relationships
  FOR ALL USING (auth_is_admin());

-- Function to update updated_at timestamp
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

-- Create semantic similarity index after table creation
CREATE INDEX IF NOT EXISTS idx_ibis_relationships_semantic ON ibis_relationships(semantic_similarity) WHERE semantic_similarity IS NOT NULL;

-- Function to get node relationships
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
  ORDER BY r.strength DESC, r.semantic_similarity DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to suggest relationships based on node types (simplified version)
CREATE OR REPLACE FUNCTION suggest_ibis_relationships(deliberation_uuid UUID)
RETURNS TABLE(
  source_node_id UUID,
  target_node_id UUID,
  suggested_type VARCHAR(50),
  source_title TEXT,
  target_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    n1.id as source_node_id,
    n2.id as target_node_id,
    CASE 
      WHEN n1.node_type = 'issue' AND n2.node_type = 'position' THEN 'elaborates'
      WHEN n1.node_type = 'position' AND n2.node_type = 'argument' THEN 'supports'
      WHEN n1.node_type = 'argument' AND n2.node_type = 'position' THEN 'challenges'
      ELSE 'similar_to'
    END as suggested_type,
    n1.title as source_title,
    n2.title as target_title
  FROM ibis_nodes n1
  CROSS JOIN ibis_nodes n2
  WHERE n1.deliberation_id = deliberation_uuid
    AND n2.deliberation_id = deliberation_uuid
    AND n1.id < n2.id -- Avoid duplicate pairs
    AND NOT EXISTS (
      SELECT 1 FROM ibis_relationships r 
      WHERE (r.source_node_id = n1.id AND r.target_node_id = n2.id)
         OR (r.source_node_id = n2.id AND r.target_node_id = n1.id)
    )
  ORDER BY n1.created_at DESC, n2.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
