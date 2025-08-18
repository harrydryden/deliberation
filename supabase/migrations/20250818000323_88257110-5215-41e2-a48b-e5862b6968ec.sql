-- Create admin access code 0000000001
INSERT INTO access_codes (
  code,
  code_type,
  is_active,
  is_used,
  max_uses,
  expires_at
) VALUES (
  '0000000001',
  'admin',
  true,
  false,
  NULL,
  now() + interval '1 year'
) ON CONFLICT (code) DO NOTHING;

-- Create admin profile for this access code
INSERT INTO profiles (
  id,
  display_name,
  role,
  user_role,
  created_at
) VALUES (
  gen_random_uuid(),
  'Admin User',
  'admin',
  'admin',
  now()
) ON CONFLICT DO NOTHING;