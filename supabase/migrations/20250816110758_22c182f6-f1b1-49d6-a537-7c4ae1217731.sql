-- Create admin function to update IBIS relationships bypassing RLS
CREATE OR REPLACE FUNCTION admin_update_ibis_relationship(
  p_relationship_id UUID,
  p_relationship_type TEXT
)
RETURNS TABLE(id UUID, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update the relationship directly, bypassing RLS
  RETURN QUERY
  UPDATE ibis_relationships 
  SET 
    relationship_type = p_relationship_type,
    created_at = now()  -- Update timestamp
  WHERE ibis_relationships.id = p_relationship_id
  RETURNING ibis_relationships.id, ibis_relationships.created_at;
END;
$$;