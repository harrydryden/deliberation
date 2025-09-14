-- Insert a test access code for development
INSERT INTO access_codes (code, code_type, is_used) 
VALUES ('1234567890', 'participant', false)
ON CONFLICT (code) DO NOTHING;