-- Add INSERT policies for user creation function to work properly

-- Allow the create_user_with_access_code function to insert into access_codes
-- This policy allows inserts when no user context is set (during user creation)
CREATE POLICY "Allow user creation function to insert access codes"
ON public.access_codes
FOR INSERT
WITH CHECK (
  -- Allow inserts during user creation process (when no user context is set)
  (current_setting('app.current_user_id', true) IS NULL OR 
   current_setting('app.current_user_id', true) = '' OR 
   current_setting('app.current_user_id', true) = 'null') OR
  -- Or when an admin is creating users
  (EXISTS (
    SELECT 1 FROM access_codes
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  ))
);

-- Allow the create_user_with_access_code function to insert into profiles
-- This policy allows inserts when no user context is set (during user creation)
CREATE POLICY "Allow user creation function to insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (
  -- Allow inserts during user creation process (when no user context is set)
  (current_setting('app.current_user_id', true) IS NULL OR 
   current_setting('app.current_user_id', true) = '' OR 
   current_setting('app.current_user_id', true) = 'null') OR
  -- Or when an admin is creating users
  (EXISTS (
    SELECT 1 FROM access_codes
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  ))
);