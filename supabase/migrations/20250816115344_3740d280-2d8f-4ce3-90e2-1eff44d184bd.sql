-- Create admin function to delete IBIS relationships bypassing RLS
CREATE OR REPLACE FUNCTION public.admin_delete_ibis_relationship(p_relationship_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete the relationship directly, bypassing RLS
  DELETE FROM ibis_relationships 
  WHERE id = p_relationship_id;
  
  -- Return true if deletion was successful
  RETURN FOUND;
END;
$function$;