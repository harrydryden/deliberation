-- Create admin function to update IBIS node positions bypassing RLS
CREATE OR REPLACE FUNCTION admin_update_ibis_node_position(
  p_node_id UUID,
  p_position_x NUMERIC,
  p_position_y NUMERIC
)
RETURNS TABLE(id UUID, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update the node position directly, bypassing RLS
  RETURN QUERY
  UPDATE ibis_nodes 
  SET 
    position_x = p_position_x,
    position_y = p_position_y,
    updated_at = now()
  WHERE ibis_nodes.id = p_node_id
  RETURNING ibis_nodes.id, ibis_nodes.updated_at;
END;
$$;