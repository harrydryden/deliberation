-- Step 2: Change column types and update data

-- Update columns to use access codes as user IDs
-- First convert the data, then change the column types

-- Convert deliberations facilitator_id from UUID to access code
UPDATE deliberations 
SET facilitator_id = (
  SELECT code FROM access_codes 
  WHERE used_by = deliberations.facilitator_id::uuid
)
WHERE facilitator_id IS NOT NULL;

-- Convert participants user_id from UUID to access code  
UPDATE participants 
SET user_id = (
  SELECT code FROM access_codes 
  WHERE used_by = participants.user_id::uuid
)
WHERE user_id IS NOT NULL;

-- Convert profiles id from UUID to access code
UPDATE profiles 
SET id = (
  SELECT code FROM access_codes 
  WHERE used_by = profiles.id::uuid
)
WHERE EXISTS (
  SELECT 1 FROM access_codes 
  WHERE used_by = profiles.id::uuid
);

-- Now change the column types
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text;
ALTER TABLE participants ALTER COLUMN user_id TYPE text;
ALTER TABLE profiles ALTER COLUMN id TYPE text;
ALTER TABLE profiles ADD PRIMARY KEY (id);

-- Drop the old function and create simplified access code functions
DROP FUNCTION IF EXISTS public.get_current_access_code_user() CASCADE;

-- Create new function that returns the current access code directly
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
        AND current_setting('app.current_user_id', true) LIKE 'access_%'
      THEN SUBSTRING(current_setting('app.current_user_id', true) FROM 8)
      ELSE NULL
    END;
$function$;

-- Create simplified admin check function
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  );
$function$;