-- Add sample access codes for testing
INSERT INTO public.access_codes (code, code_type) VALUES 
('0000000001', 'admin'),
('0000000002', 'user'),
('1234567890', 'admin'),
('0987654321', 'user')
ON CONFLICT (code) DO NOTHING;