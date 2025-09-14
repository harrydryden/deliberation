-- Remove the usage tracking from access codes to make them reusable
-- We'll keep the columns for backward compatibility but they won't be used

-- First drop the trigger, then the function
DROP TRIGGER IF EXISTS on_access_code_used ON public.access_codes;
DROP FUNCTION IF EXISTS public.handle_admin_access_code() CASCADE;

-- Update RLS policies to allow reading access codes without usage restrictions
DROP POLICY IF EXISTS "Authenticated users can mark access codes as used" ON public.access_codes;
DROP POLICY IF EXISTS "Anyone can read access codes for authentication" ON public.access_codes;

-- Create new policy that allows reading access codes for authentication
CREATE POLICY "Anyone can read access codes for authentication" 
ON public.access_codes 
FOR SELECT 
USING (true);

-- Remove the function that marks access codes as used since we don't need it anymore
DROP FUNCTION IF EXISTS public.mark_access_code_used(character varying, uuid);

-- Create new function that grants admin role when users authenticate with admin codes
-- This will be used in the application logic rather than a database trigger
CREATE OR REPLACE FUNCTION public.get_access_code_type(access_code text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT code_type FROM public.access_codes WHERE code = access_code;
$$;