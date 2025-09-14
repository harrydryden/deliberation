-- Create admin function to create IBIS relationships bypassing RLS
CREATE OR REPLACE FUNCTION admin_create_ibis_relationship(
  p_source_node_id UUID,
  p_target_node_id UUID,
  p_relationship_type TEXT,
  p_deliberation_id UUID,
  p_created_by UUID
)
RETURNS TABLE(id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert the relationship directly, bypassing RLS
  RETURN QUERY
  INSERT INTO ibis_relationships (
    source_node_id,
    target_node_id,
    relationship_type,
    deliberation_id,
    created_by
  ) VALUES (
    p_source_node_id,
    p_target_node_id,
    p_relationship_type,
    p_deliberation_id,
    p_created_by
  )
  RETURNING ibis_relationships.id, ibis_relationships.created_at;
END;
$$;