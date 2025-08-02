-- Add access code expiration and security enhancements
ALTER TABLE access_codes 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '90 days'),
ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_uses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_access_codes_expires_at ON access_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes(is_active) WHERE is_active = true;

-- Create a function to validate access codes with expiration
CREATE OR REPLACE FUNCTION public.validate_access_code(input_code text)
RETURNS TABLE(
  valid boolean,
  code_type text,
  expired boolean,
  max_uses_reached boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN ac.id IS NULL THEN false
      WHEN NOT ac.is_active THEN false
      WHEN ac.expires_at < now() THEN false
      WHEN ac.max_uses IS NOT NULL AND ac.current_uses >= ac.max_uses THEN false
      ELSE true
    END as valid,
    ac.code_type,
    CASE WHEN ac.expires_at < now() THEN true ELSE false END as expired,
    CASE WHEN ac.max_uses IS NOT NULL AND ac.current_uses >= ac.max_uses THEN true ELSE false END as max_uses_reached
  FROM access_codes ac
  WHERE ac.code = input_code;
  
  -- If no record found, return false values
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, null::text, false, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to increment access code usage
CREATE OR REPLACE FUNCTION public.increment_access_code_usage(input_code text)
RETURNS boolean AS $$
DECLARE
  code_record RECORD;
BEGIN
  -- Get the access code record
  SELECT * INTO code_record FROM access_codes WHERE code = input_code;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Update usage count and last used timestamp
  UPDATE access_codes 
  SET 
    current_uses = current_uses + 1,
    last_used_at = now()
  WHERE code = input_code;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to clean up expired access codes
CREATE OR REPLACE FUNCTION public.cleanup_expired_access_codes()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Mark expired codes as inactive instead of deleting them for audit purposes
  UPDATE access_codes 
  SET is_active = false 
  WHERE expires_at < now() AND is_active = true;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing access codes to have expiration dates
UPDATE access_codes 
SET expires_at = created_at + interval '90 days'
WHERE expires_at IS NULL;