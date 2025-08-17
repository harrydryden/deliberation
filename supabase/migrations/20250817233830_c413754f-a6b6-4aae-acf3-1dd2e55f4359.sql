-- Update get_current_access_code_user function to return the UUID from access_codes table
-- This way existing data with UUIDs will work correctly

CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
        AND current_setting('app.current_user_id', true) != ''
        AND current_setting('app.current_user_id', true) != 'null'
        AND current_setting('app.current_user_id', true) LIKE 'access_%'
      THEN (
        SELECT used_by 
        FROM access_codes 
        WHERE code = SUBSTRING(current_setting('app.current_user_id', true) FROM 8)
        AND is_used = true
        LIMIT 1
      )
      ELSE NULL
    END;
$function$;