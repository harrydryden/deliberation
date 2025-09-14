-- Add access code columns directly to profiles table for simple storage and retrieval
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS access_code_1 TEXT,
ADD COLUMN IF NOT EXISTS access_code_2 TEXT;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_access_codes ON public.profiles(access_code_1, access_code_2);