-- Update all user passwords to match their access_code_2
-- This will allow users to login with their access codes
CREATE OR REPLACE FUNCTION public.sync_user_passwords()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  profile_record RECORD;
BEGIN
  -- Loop through all profiles that have access codes
  FOR profile_record IN 
    SELECT id, access_code_2
    FROM profiles 
    WHERE access_code_2 IS NOT NULL 
    AND access_code_2 != ''
  LOOP
    -- Update the password for this user in auth.users
    -- We need to use the auth admin functions to update passwords
    UPDATE auth.users 
    SET encrypted_password = crypt(profile_record.access_code_2, gen_salt('bf'))
    WHERE id = profile_record.id;
  END LOOP;
  
  RAISE NOTICE 'User passwords synced with access codes';
END;
$$;

-- Execute the function to sync passwords
SELECT sync_user_passwords();