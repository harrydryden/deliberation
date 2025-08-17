-- Step 2: Change column types first, then update data

-- Change column types to text
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text USING facilitator_id::text;
ALTER TABLE participants ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE profiles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE profiles ADD PRIMARY KEY (id);

-- Convert UUID strings to access codes in the data
UPDATE deliberations 
SET facilitator_id = (
  SELECT code FROM access_codes 
  WHERE used_by::text = deliberations.facilitator_id
)
WHERE facilitator_id IS NOT NULL;

UPDATE participants 
SET user_id = (
  SELECT code FROM access_codes 
  WHERE used_by::text = participants.user_id
)
WHERE user_id IS NOT NULL;

UPDATE profiles 
SET id = (
  SELECT code FROM access_codes 
  WHERE used_by::text = profiles.id
)
WHERE EXISTS (
  SELECT 1 FROM access_codes 
  WHERE used_by::text = profiles.id
);

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