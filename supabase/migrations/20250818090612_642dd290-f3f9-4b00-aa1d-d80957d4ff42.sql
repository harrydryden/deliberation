-- Fix the get_current_user_access_code function to actually return the access code, not the user ID
CREATE OR REPLACE FUNCTION public.get_current_user_access_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      WHEN current_setting('app.current_access_code', true) IS NOT NULL 
        AND current_setting('app.current_access_code', true) != ''
        AND current_setting('app.current_access_code', true) != 'null'
      THEN current_setting('app.current_access_code', true)
      ELSE NULL
    END;
$function$;