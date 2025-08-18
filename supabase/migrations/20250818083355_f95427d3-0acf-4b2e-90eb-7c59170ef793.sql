-- Fix the get_current_access_code_user function to handle access codes properly
CREATE OR REPLACE FUNCTION public.get_current_access_code_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
        AND current_setting('app.current_user_id', true) != ''
        AND current_setting('app.current_user_id', true) != 'null'
      THEN 
        -- First check if it's already a valid UUID
        CASE 
          WHEN current_setting('app.current_user_id', true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
          THEN current_setting('app.current_user_id', true)::uuid
          -- Otherwise treat it as an access code and look up the user UUID
          ELSE (
            SELECT used_by FROM access_codes 
            WHERE code = current_setting('app.current_user_id', true) 
            AND is_active = true 
            AND is_used = true 
            LIMIT 1
          )
        END
      ELSE NULL
    END;
$$;