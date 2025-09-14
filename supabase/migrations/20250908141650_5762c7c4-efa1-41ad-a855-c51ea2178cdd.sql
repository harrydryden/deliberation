-- Add the missing updated_at column to deliberations table
ALTER TABLE public.deliberations 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;