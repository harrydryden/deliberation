-- Change all column types to text and recreate functions
ALTER TABLE deliberations ALTER COLUMN facilitator_id TYPE text;
ALTER TABLE participants ALTER COLUMN user_id TYPE text;  
ALTER TABLE agent_configurations ALTER COLUMN created_by TYPE text;
ALTER TABLE ibis_nodes ALTER COLUMN created_by TYPE text;
ALTER TABLE ibis_relationships ALTER COLUMN created_by TYPE text;
ALTER TABLE profiles ALTER COLUMN id TYPE text;
ALTER TABLE profiles ADD PRIMARY KEY (id);
ALTER TABLE profiles ALTER COLUMN archived_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN used_by TYPE text;
ALTER TABLE access_codes ALTER COLUMN created_by TYPE text;
ALTER TABLE audit_logs ALTER COLUMN user_id TYPE text;
ALTER TABLE agent_knowledge ALTER COLUMN created_by TYPE text;
ALTER TABLE user_sessions ALTER COLUMN user_id TYPE text;
ALTER TABLE facilitator_sessions ALTER COLUMN user_id TYPE text;

-- Update all functions to work with access codes directly
DROP FUNCTION IF EXISTS public.get_current_access_code_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_access_code_user() CASCADE;

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

-- Recreate essential RLS policies with access codes
-- Deliberations policies
CREATE POLICY "Users can view public deliberations" 
ON public.deliberations 
FOR SELECT 
TO public
USING (is_public = true);

CREATE POLICY "Users can view deliberations they participate in" 
ON public.deliberations 
FOR SELECT 
TO public
USING (
  EXISTS (
    SELECT 1 FROM participants 
    WHERE participants.deliberation_id = deliberations.id 
    AND participants.user_id = get_current_user_access_code()
  )
);

CREATE POLICY "Admins can view all deliberations" 
ON public.deliberations 
FOR SELECT 
TO public
USING (is_admin_user());

-- Messages policies
CREATE POLICY "Users can only view their own messages" 
ON public.messages 
FOR SELECT 
TO public
USING (
  user_id = get_current_user_access_code() OR is_admin_user()
);

CREATE POLICY "Users can create messages as themselves" 
ON public.messages 
FOR INSERT 
TO public
WITH CHECK (
  user_id IS NOT NULL AND 
  length(user_id) > 0 AND 
  get_current_user_access_code() IS NOT NULL AND 
  user_id = get_current_user_access_code()
);

-- Participants policies
CREATE POLICY "Anyone can join as participant" 
ON public.participants 
FOR INSERT 
TO public
WITH CHECK (true);

CREATE POLICY "Users can leave deliberations" 
ON public.participants 
FOR DELETE 
TO public
USING (true);

-- Profiles policies
CREATE POLICY "Users can view non-archived profiles" 
ON public.profiles 
FOR SELECT 
TO public
USING ((NOT is_archived) OR (is_archived IS NULL));

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
TO public
USING (is_admin_user());