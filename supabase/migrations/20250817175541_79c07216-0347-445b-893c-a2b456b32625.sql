-- Create the set_config function that's used by the enhanced Supabase client
CREATE OR REPLACE FUNCTION public.set_config(setting_name text, new_value text, is_local boolean DEFAULT false)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT set_config(setting_name, new_value, is_local);
$$;