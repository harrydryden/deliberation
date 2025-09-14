-- Delete the manually created users that may have incorrect schema setup
DELETE FROM auth.users WHERE email IN ('ADMIN@deliberation.local', 'SUPER@deliberation.local');

-- Also clean up the user_roles table
DELETE FROM public.user_roles 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email IN ('ADMIN@deliberation.local', 'SUPER@deliberation.local')
);