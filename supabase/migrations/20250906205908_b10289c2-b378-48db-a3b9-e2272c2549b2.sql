-- Clean up the test user
DELETE FROM auth.users WHERE email = 'TESTD@deliberation.local';
DELETE FROM profiles WHERE access_code_1 = 'TESTD';