-- Fix RLS policies for access_codes table to allow authenticated users to mark codes as used

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "System can update access codes when used" ON public.access_codes;

-- Create a new UPDATE policy that allows authenticated users to mark their own access code as used
-- This will allow the user who just authenticated to update the access code they used
CREATE POLICY "Authenticated users can mark access codes as used" 
ON public.access_codes 
FOR UPDATE 
USING (is_used = false)  -- Can only update unused codes
WITH CHECK (
  is_used = true AND 
  used_by = auth.uid() AND 
  used_at IS NOT NULL
);  -- Can only mark as used with proper user_id and timestamp

-- Alternative: Create a security definer function for updating access codes
-- This provides elevated privileges for the specific operation
CREATE OR REPLACE FUNCTION public.mark_access_code_used(
  access_code VARCHAR(10),
  user_uuid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  code_exists BOOLEAN;
BEGIN
  -- Check if the code exists and is unused
  SELECT EXISTS(
    SELECT 1 FROM public.access_codes 
    WHERE code = access_code AND is_used = false
  ) INTO code_exists;
  
  IF NOT code_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Update the access code
  UPDATE public.access_codes 
  SET 
    is_used = true,
    used_by = user_uuid,
    used_at = now()
  WHERE code = access_code AND is_used = false;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.mark_access_code_used(VARCHAR, UUID) TO authenticated;