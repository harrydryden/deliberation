-- Create new access code-based functions and policies
-- This approach keeps existing data and adds new access code functionality

-- Create function to get current access code (not UUID)
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

-- Create function to check if current user is admin
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

-- Create function to check if user participates in deliberation
CREATE OR REPLACE FUNCTION public.user_participates_in_deliberation_by_code(deliberation_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM participants 
    WHERE deliberation_id = deliberation_uuid 
    AND user_id = get_current_user_access_code()
  );
$function$;

-- Recreate RLS policies using access codes
CREATE POLICY "Users can view public deliberations" 
ON public.deliberations 
FOR SELECT 
TO public
USING (is_public = true);

CREATE POLICY "Users can view deliberations they participate in" 
ON public.deliberations 
FOR SELECT 
TO public
USING (user_participates_in_deliberation_by_code(id));

CREATE POLICY "Admins can manage deliberations" 
ON public.deliberations 
FOR ALL
TO public
USING (is_admin_user())
WITH CHECK (is_admin_user());

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
USING (user_id = get_current_user_access_code());

-- Messages policies  
CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
TO public
USING (user_id = get_current_user_access_code() OR is_admin_user());

CREATE POLICY "Users can create messages as themselves" 
ON public.messages 
FOR INSERT 
TO public
WITH CHECK (
  user_id IS NOT NULL AND 
  user_id = get_current_user_access_code()
);

-- Profiles policies
CREATE POLICY "Users can view non-archived profiles" 
ON public.profiles 
FOR SELECT 
TO public
USING ((NOT is_archived) OR (is_archived IS NULL) OR is_admin_user());

CREATE POLICY "Admins can manage profiles" 
ON public.profiles 
FOR ALL
TO public
USING (is_admin_user())
WITH CHECK (is_admin_user());