-- Create admin access codes
INSERT INTO public.access_codes (code, code_type) VALUES 
  ('ADMIN00001', 'admin'),
  ('ADMIN00002', 'admin'),
  ('ADMIN00003', 'admin');

-- Add admin role column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS user_role text DEFAULT 'user';

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND user_role = 'admin'
  );
$$;

-- Create function to mark user as admin when using admin access code
CREATE OR REPLACE FUNCTION public.handle_admin_access_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- If an admin access code was used, mark the user as admin
  IF NEW.is_used = true AND NEW.used_by IS NOT NULL THEN
    UPDATE public.profiles 
    SET user_role = CASE 
      WHEN NEW.code_type = 'admin' THEN 'admin'
      ELSE user_role
    END
    WHERE id = NEW.used_by;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically assign admin role
DROP TRIGGER IF EXISTS on_access_code_used ON public.access_codes;
CREATE TRIGGER on_access_code_used
  AFTER UPDATE ON public.access_codes
  FOR EACH ROW 
  WHEN (NEW.is_used = true AND OLD.is_used = false)
  EXECUTE FUNCTION public.handle_admin_access_code();

-- Update RLS policies for admin access
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can view all deliberations" ON public.deliberations
  FOR SELECT USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can manage all deliberations" ON public.deliberations
  FOR ALL USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can view all participants" ON public.participants
  FOR SELECT USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can manage all participants" ON public.participants
  FOR ALL USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can view all messages" ON public.messages
  FOR SELECT USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admins can view all agent interactions" ON public.agent_interactions
  FOR SELECT USING (public.is_admin_user(auth.uid()));