-- Add notion field to deliberations table
ALTER TABLE public.deliberations 
ADD COLUMN notion TEXT;

-- Add a check constraint to limit notion to 100 characters
ALTER TABLE public.deliberations 
ADD CONSTRAINT notion_length_check CHECK (char_length(notion) <= 100);