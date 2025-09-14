-- Remove the existing admin access codes that aren't digits-only
DELETE FROM public.access_codes WHERE code_type = 'admin' AND code NOT SIMILAR TO '[0-9]+';

-- Insert the single admin access code with digits only
INSERT INTO public.access_codes (code, code_type) VALUES ('0000000001', 'admin')
ON CONFLICT (code) DO NOTHING;

-- Add constraint to ensure all access codes are digits only
ALTER TABLE public.access_codes 
DROP CONSTRAINT IF EXISTS access_codes_digits_only;

ALTER TABLE public.access_codes 
ADD CONSTRAINT access_codes_digits_only 
CHECK (code ~ '^[0-9]+$');

-- Update existing non-digit codes to be digits only (if any)
UPDATE public.access_codes 
SET code = LPAD(EXTRACT(epoch FROM created_at)::text, 10, '0')
WHERE code !~ '^[0-9]+$' AND code_type != 'admin';