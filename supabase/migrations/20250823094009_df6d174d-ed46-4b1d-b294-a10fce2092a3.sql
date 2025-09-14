-- Update the notion length check constraint to allow up to 250 characters
ALTER TABLE public.deliberations DROP CONSTRAINT IF EXISTS notion_length_check;
ALTER TABLE public.deliberations ADD CONSTRAINT notion_length_check CHECK (char_length(notion) <= 250);