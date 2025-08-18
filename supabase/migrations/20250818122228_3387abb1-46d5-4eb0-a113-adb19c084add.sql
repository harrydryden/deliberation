-- Check if users were created correctly and fix any issues
SELECT email, encrypted_password, email_confirmed_at, raw_user_meta_data 
FROM auth.users 
WHERE email IN ('ADMIN@deliberation.local', 'SUPER@deliberation.local');

-- Also check the user_roles table
SELECT ur.role, u.email 
FROM auth.users u
JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email IN ('ADMIN@deliberation.local', 'SUPER@deliberation.local');