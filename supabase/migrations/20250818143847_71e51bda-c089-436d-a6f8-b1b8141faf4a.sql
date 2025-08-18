-- Remove the foreign key constraint from profiles table that references auth.users
-- since we're creating profiles for access code users without Supabase Auth
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Also ensure the profiles table can accept any UUID as the id
-- The table structure should remain the same, just without the foreign key constraint