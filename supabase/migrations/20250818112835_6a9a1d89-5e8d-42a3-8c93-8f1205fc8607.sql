-- Fix get_authenticated_user to use the correct function without extra wrapping
CREATE OR REPLACE FUNCTION public.get_authenticated_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN get_current_access_code_user();
END;
$function$;