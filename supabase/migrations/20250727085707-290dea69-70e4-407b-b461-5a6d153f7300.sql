-- Fix the current user's profile to have admin role
UPDATE public.profiles 
SET user_role = 'admin', updated_at = now()
WHERE id = '2759f58d-1ee0-4ec9-aa41-59d3241f9b96';