-- Drop the existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS admin_get_ibis_nodes(uuid);

-- Add updated_at column to ibis_nodes table
ALTER TABLE ibis_nodes 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_ibis_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add trigger to ibis_nodes table
DROP TRIGGER IF EXISTS update_ibis_nodes_updated_at_trigger ON ibis_nodes;
CREATE TRIGGER update_ibis_nodes_updated_at_trigger
  BEFORE UPDATE ON ibis_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_ibis_nodes_updated_at();

-- Set updated_at to created_at for existing records
UPDATE ibis_nodes SET updated_at = created_at WHERE updated_at IS NULL;

-- Now recreate the admin_get_ibis_nodes function with correct schema
CREATE OR REPLACE FUNCTION admin_get_ibis_nodes(target_deliberation_id UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  node_type TEXT,
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
    n.node_type::TEXT,
    n.parent_node_id,
    n.position_x,
    n.position_y,
    n.message_id,
    n.created_at,
    n.updated_at,
    n.created_by,
    n.deliberation_id,
    n.embedding
  FROM ibis_nodes n
  WHERE n.deliberation_id = target_deliberation_id
  ORDER BY n.created_at DESC;
END;
$$;

-- Fix the admin_update_ibis_node_position function to use VOID return type
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
    position_y = p_position_y,
    updated_at = now()
  WHERE id = p_node_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IBIS node not found with ID: %', p_node_id;
  END IF;
END;
$$;