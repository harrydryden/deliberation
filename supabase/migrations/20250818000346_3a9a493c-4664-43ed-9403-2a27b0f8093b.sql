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
) ON CONFLICT (code) DO UPDATE SET
  code_type = 'admin',
  is_active = true,
  is_used = false;