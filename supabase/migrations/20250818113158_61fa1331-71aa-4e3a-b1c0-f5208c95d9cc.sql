-- Update get_authenticated_user to use the new clean function
CREATE OR REPLACE FUNCTION public.get_authenticated_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN get_current_user_id_clean()::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;