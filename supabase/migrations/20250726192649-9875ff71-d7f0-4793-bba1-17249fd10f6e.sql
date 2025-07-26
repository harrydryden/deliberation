-- Remove the usage tracking from access codes to make them reusable
-- We'll keep the columns for backward compatibility but they won't be used

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

-- Update the trigger that handles admin access codes to not rely on usage status
DROP TRIGGER IF EXISTS access_code_admin_trigger ON public.access_codes;
DROP FUNCTION IF EXISTS public.handle_admin_access_code();

-- Create new function that grants admin role based on access code type
CREATE OR REPLACE FUNCTION public.handle_admin_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- If an admin access code is being used for authentication, mark user as admin
  -- This will be called when a user profile is created/updated with an admin access code
  IF NEW.code_type = 'admin' THEN
    UPDATE public.profiles 
    SET user_role = 'admin'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;