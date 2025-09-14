-- Create admin function to create AI-generated IBIS nodes
CREATE OR REPLACE FUNCTION admin_create_ai_ibis_node(
  p_deliberation_id uuid,
  p_node_type text,
  p_title text,
  p_description text,
  p_position_x double precision DEFAULT 0,
  p_position_y double precision DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  deliberation_id uuid,
  node_type text,
  title text,
  description text,
  position_x double precision,
  position_y double precision,
  created_by uuid,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Insert the AI-generated IBIS node directly, bypassing RLS
  RETURN QUERY
  INSERT INTO ibis_nodes (
    deliberation_id,
    node_type,
    title,
    description,
    position_x,
    position_y,
    created_by
  ) VALUES (
    p_deliberation_id,
    p_node_type::ibis_node_type,
    p_title,
    p_description,
    p_position_x,
    p_position_y,
    NULL -- AI-generated, no specific user
  )
  RETURNING 
    ibis_nodes.id,
    ibis_nodes.deliberation_id,
    ibis_nodes.node_type::text,
    ibis_nodes.title,
    ibis_nodes.description,
    ibis_nodes.position_x,
    ibis_nodes.position_y,
    ibis_nodes.created_by,
    ibis_nodes.created_at;
END;
$$;