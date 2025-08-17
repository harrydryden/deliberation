-- Convert the entire system to use access codes as user IDs instead of UUIDs

-- First, let's update the core tables to use access codes directly

-- Update deliberations table
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text;

-- Update participants table  
ALTER TABLE participants ALTER COLUMN user_id TYPE text;

-- Update messages table (already text, but ensure it's clean)
-- messages.user_id is already text

-- Update agent_configurations table
ALTER TABLE agent_configurations ALTER COLUMN created_by TYPE text;

-- Update ibis_nodes table
ALTER TABLE ibis_nodes ALTER COLUMN created_by TYPE text;

-- Update ibis_relationships table
ALTER TABLE ibis_relationships ALTER COLUMN created_by TYPE text;

-- Update profiles table to use access code as primary key
-- First drop existing constraints and recreate
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE profiles ALTER COLUMN id TYPE text;
ALTER TABLE profiles ADD PRIMARY KEY (id);

-- Update other profile-related columns
ALTER TABLE profiles ALTER COLUMN archived_by TYPE text;

-- Update access_codes table
ALTER TABLE access_codes ALTER COLUMN used_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN created_by TYPE text;

-- Update audit_logs table
ALTER TABLE audit_logs ALTER COLUMN user_id TYPE text;

-- Update agent_knowledge table
ALTER TABLE agent_knowledge ALTER COLUMN created_by TYPE text;

-- Update user_sessions table
ALTER TABLE user_sessions ALTER COLUMN user_id TYPE text;

-- Update facilitator_sessions table
ALTER TABLE facilitator_sessions ALTER COLUMN user_id TYPE text;

-- Drop the old UUID-based function and create new access code function
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