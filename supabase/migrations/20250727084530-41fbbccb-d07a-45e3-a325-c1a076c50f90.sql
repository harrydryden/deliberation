-- Update RLS policies to work with custom session management instead of auth.uid()

-- First, let's create a function to get the current session user ID from the custom header
CREATE OR REPLACE FUNCTION public.get_current_session_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('request.headers.x-user-id', true);
$$;

-- Update profiles policies to work with session-based auth
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Note: profiles.id is currently uuid, but we'll store text user IDs, so we need to handle this
-- For now, let's modify the policies to work with the existing structure
-- We'll need to convert profiles.id to text in the next step

-- Update the is_admin_user function to work with session-based auth using text user IDs
DROP FUNCTION IF EXISTS public.is_admin_user(uuid);

CREATE OR REPLACE FUNCTION public.is_admin_user(input_user_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id::text = COALESCE(input_user_id, get_current_session_user_id()) 
    AND user_role = 'admin'
  );
$$;

-- Create a temporary approach: modify the profiles table to accept text IDs
-- First, let's change the profiles table id column type
ALTER TABLE public.profiles ALTER COLUMN id TYPE text;