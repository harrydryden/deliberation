-- Properly increase the code column size
ALTER TABLE access_codes ALTER COLUMN code TYPE varchar(12);

-- Now test the user creation function
SELECT user_id, access_code, profile_created FROM create_user_with_access_code('user', NULL) LIMIT 1;