-- Remove the foreign key constraint from profiles table that references auth.users
-- This is needed because we're using access codes instead of Supabase Auth
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Ensure the profiles table works with our access code system
-- The id should just be a UUID that matches the user_id from access_codes