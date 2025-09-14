-- Create an admin function to get IBIS nodes bypassing RLS
CREATE OR REPLACE FUNCTION admin_get_ibis_nodes(target_deliberation_id UUID)
RETURNS TABLE (
  id UUID,
  deliberation_id UUID,
  message_id UUID,
  node_type TEXT,
  parent_node_id UUID,
  position_x DOUBLE PRECISION,
  position_y DOUBLE PRECISION,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  embedding VECTOR,
  title TEXT,
  description TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT 
    n.id,
    n.deliberation_id,
    n.message_id,
    n.node_type::TEXT,
    n.parent_node_id,
    n.position_x,
    n.position_y,
    n.created_by,
    n.created_at,
    n.updated_at,
    n.embedding,
    n.title,
    n.description
  FROM ibis_nodes n
  WHERE n.deliberation_id = target_deliberation_id
  ORDER BY n.created_at ASC;
$$;

-- Grant execution to authenticated users (we'll rely on application-level checks)
GRANT EXECUTE ON FUNCTION admin_get_ibis_nodes(UUID) TO authenticated;

-- Create a similar function for relationships
CREATE OR REPLACE FUNCTION admin_get_ibis_relationships(target_deliberation_id UUID)
RETURNS TABLE (
  id UUID,
  source_node_id UUID,
  target_node_id UUID,
  created_at TIMESTAMPTZ,
  created_by UUID,
  deliberation_id UUID,
  relationship_type TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT 
    r.id,
    r.source_node_id,
    r.target_node_id,
    r.created_at,
    r.created_by,
    r.deliberation_id,
    r.relationship_type
  FROM ibis_relationships r
  WHERE r.deliberation_id = target_deliberation_id
  ORDER BY r.created_at ASC;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION admin_get_ibis_relationships(UUID) TO authenticated;