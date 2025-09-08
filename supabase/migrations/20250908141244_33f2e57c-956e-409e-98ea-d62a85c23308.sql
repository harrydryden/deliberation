-- Add updated_at column and trigger to deliberations table
-- This fixes the "record 'new' has no field 'updated_at'" error

-- Add updated_at column to deliberations table
ALTER TABLE public.deliberations 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Update existing records to have the updated_at value
UPDATE public.deliberations 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Make updated_at non-nullable after setting values
ALTER TABLE public.deliberations 
ALTER COLUMN updated_at SET NOT NULL;

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_deliberations_updated_at
  BEFORE UPDATE ON public.deliberations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();