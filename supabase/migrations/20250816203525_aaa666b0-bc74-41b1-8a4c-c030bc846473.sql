-- Insert a 10-character admin access code for testing
INSERT INTO access_codes (code, code_type, is_active, expires_at, max_uses, current_uses) 
VALUES ('ADMIN00001', 'admin', true, '2025-12-31 23:59:59+00', NULL, 0)
ON CONFLICT (code) DO UPDATE SET 
  code_type = 'admin',
  is_active = true,
  expires_at = '2025-12-31 23:59:59+00';