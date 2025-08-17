-- Drop all RLS policies that reference the columns we're changing
DROP POLICY IF EXISTS "Users can view deliberations they participate in" ON public.deliberations;
DROP POLICY IF EXISTS "Users can view public deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can view all deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can create deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Admins can delete deliberations" ON public.deliberations;
DROP POLICY IF EXISTS "Anyone can join as participant" ON public.participants;
DROP POLICY IF EXISTS "Users can leave deliberations" ON public.participants;
DROP POLICY IF EXISTS "Users can only view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages as themselves" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view non-archived profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles including archived" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can archive profiles" ON public.profiles;

-- Drop functions that reference UUIDs
DROP FUNCTION IF EXISTS public.get_current_access_code_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_access_code_user() CASCADE;