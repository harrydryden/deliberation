-- Create admin access codes with digits only
INSERT INTO access_codes (code, code_type) VALUES 
  ('0000000003', 'admin'),
  ('0000000004', 'admin');

-- Run the assignment function again to assign the new admin codes
SELECT assign_access_codes_to_users();