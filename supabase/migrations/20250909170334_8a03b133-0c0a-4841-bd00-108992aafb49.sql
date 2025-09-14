-- Fix the admin_get_ibis_nodes function to use correct column names
CREATE OR REPLACE FUNCTION admin_get_ibis_nodes(target_deliberation_id UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  node_type ibis_node_type,
  parent_node_id UUID,
  position_x DOUBLE PRECISION,
  position_y DOUBLE PRECISION,
  message_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  deliberation_id UUID,
  embedding vector(1536)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT auth_is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    n.id,
    n.title,
    n.description,
    n.node_type,
    n.parent_node_id,
    n.position_x,
    n.position_y,
    n.message_id,
    n.created_at,
    n.created_at as updated_at, -- Use created_at as updated_at since the column doesn't exist
    n.created_by,
    n.deliberation_id,
    n.embedding
  FROM ibis_nodes n
  WHERE n.deliberation_id = target_deliberation_id
  ORDER BY n.created_at DESC;
END;
$$;

-- Also create the admin_get_ibis_relationships function if it doesn't work properly
CREATE OR REPLACE FUNCTION admin_get_ibis_relationships(target_deliberation_id UUID)
RETURNS TABLE(
  id UUID,
  source_node_id UUID,
  target_node_id UUID,
  relationship_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  deliberation_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT auth_is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    r.id,
    r.source_node_id,
    r.target_node_id,
    r.relationship_type,
    r.created_at,
    r.created_by,
    r.deliberation_id
  FROM ibis_relationships r
  WHERE r.deliberation_id = target_deliberation_id
  ORDER BY r.created_at DESC;
END;
$$;

-- Add functions for updating node positions and managing relationships
CREATE OR REPLACE FUNCTION admin_update_ibis_node_position(
  p_node_id UUID,
  p_position_x DOUBLE PRECISION,
  p_position_y DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT auth_is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  UPDATE ibis_nodes 
  SET 
    position_x = p_position_x,
    position_y = p_position_y
  WHERE id = p_node_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IBIS node not found with ID: %', p_node_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_ibis_relationship(
  p_source_node_id UUID,
  p_target_node_id UUID,
  p_relationship_type TEXT,
  p_deliberation_id UUID,
  p_created_by UUID
)
RETURNS TABLE(
  id UUID,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
  new_created_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check if user is admin
  IF NOT auth_is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Validate relationship type
  IF p_relationship_type NOT IN ('supports', 'opposes', 'relates_to', 'responds_to') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- Insert the relationship
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
  ) RETURNING ibis_relationships.id, ibis_relationships.created_at
  INTO new_id, new_created_at;

  RETURN QUERY SELECT new_id, new_created_at;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_ibis_relationship(
  p_relationship_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT auth_is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  DELETE FROM ibis_relationships 
  WHERE id = p_relationship_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IBIS relationship not found with ID: %', p_relationship_id;
  END IF;
END;
$$;