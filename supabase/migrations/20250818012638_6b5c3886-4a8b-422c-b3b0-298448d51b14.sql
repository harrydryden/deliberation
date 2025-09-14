-- Fix the user context handling to properly convert access codes to UUIDs
-- Drop and recreate the get_current_access_code_user function to handle access codes properly

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
      THEN 
        -- If the current_user_id looks like an access code (starts with 'access_'), 
        -- look up the actual user UUID from the access_codes table
        CASE 
          WHEN current_setting('app.current_user_id', true) LIKE 'access_%' THEN
            (SELECT used_by FROM access_codes 
             WHERE code = current_setting('app.current_user_id', true) 
             AND is_active = true 
             AND is_used = true 
             LIMIT 1)
          ELSE
            -- If it's already a UUID, use it directly
            current_setting('app.current_user_id', true)::uuid
        END
      ELSE NULL
    END;
$function$;

-- Also create a helper function to get current user access code  
CREATE OR REPLACE FUNCTION public.get_current_user_access_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      WHEN current_setting('app.current_user_id', true) IS NOT NULL 
        AND current_setting('app.current_user_id', true) != ''
        AND current_setting('app.current_user_id', true) != 'null'
      THEN current_setting('app.current_user_id', true)
      ELSE NULL
    END;
$function$;

-- Update participants RLS policies to handle both UUIDs and access codes properly
DROP POLICY IF EXISTS "Allow users to join deliberations" ON participants;
CREATE POLICY "Allow users to join deliberations" 
ON participants 
FOR INSERT 
WITH CHECK (
  user_id = (get_current_access_code_user())::text OR
  user_id = get_current_user_access_code()
);

-- Update messages RLS policies
DROP POLICY IF EXISTS "Users can create their own messages" ON messages;
CREATE POLICY "Users can create their own messages" 
ON messages 
FOR INSERT 
WITH CHECK (
  user_id = (get_current_access_code_user())::text OR
  user_id = get_current_user_access_code()
);

-- Update the participants SELECT policy to use proper user lookup
DROP POLICY IF EXISTS "Users can view participants in their deliberations" ON participants;
CREATE POLICY "Users can view participants in their deliberations" 
ON participants 
FOR SELECT 
USING (
  deliberation_id IN (
    SELECT DISTINCT p.deliberation_id
    FROM participants p
    WHERE p.user_id = (get_current_access_code_user())::text
       OR p.user_id = get_current_user_access_code()
  )
);