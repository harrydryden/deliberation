-- Remove the foreign key constraint from user_roles table that references auth.users
-- since we're creating user roles for access code users without Supabase Auth
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;