-- Clean up the final test user
DELETE FROM auth.users WHERE email = 'NEWUSER@deliberation.local';
DELETE FROM profiles WHERE access_code_1 = 'NEWUS';