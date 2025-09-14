-- Remove duplicate admin_update_ibis_node_position function
-- Keep the version with double precision parameters as it's more precise

-- Drop the version that returns a table (this appears to be the older version)
DROP FUNCTION IF EXISTS public.admin_update_ibis_node_position(uuid, numeric, numeric);

-- Ensure we have the canonical version with double precision
CREATE OR REPLACE FUNCTION public.admin_update_ibis_node_position(p_node_id uuid, p_position_x double precision, p_position_y double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;