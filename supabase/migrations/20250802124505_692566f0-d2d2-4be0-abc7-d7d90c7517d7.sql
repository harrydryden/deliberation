-- Create some admin access codes for the admin users who don't have them
INSERT INTO access_codes (code, code_type) VALUES 
  (generate_secure_access_code(), 'admin'),
  (generate_secure_access_code(), 'admin');

-- Run the assignment function again to assign the new admin codes
SELECT assign_access_codes_to_users();