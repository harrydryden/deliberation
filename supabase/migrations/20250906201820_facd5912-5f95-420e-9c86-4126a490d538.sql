-- Restore access code fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_code_1 VARCHAR(5);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_code_2 VARCHAR(6);

-- Create indexes for better performance on access code fields
CREATE INDEX IF NOT EXISTS idx_profiles_access_code_1 ON profiles(access_code_1);
CREATE INDEX IF NOT EXISTS idx_profiles_access_code_2 ON profiles(access_code_2);

-- Add constraints to ensure data integrity
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_access_code_1_format CHECK (access_code_1 IS NULL OR access_code_1 ~ '^[A-Z]{5}$');
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_access_code_2_format CHECK (access_code_2 IS NULL OR access_code_2 ~ '^\d{6}$');

-- Function to generate random access codes
CREATE OR REPLACE FUNCTION generate_access_code_1()
RETURNS VARCHAR(5) AS $$
BEGIN
  RETURN UPPER(CHR(65 + (RANDOM() * 25)::INT) || 
               CHR(65 + (RANDOM() * 25)::INT) || 
               CHR(65 + (RANDOM() * 25)::INT) || 
               CHR(65 + (RANDOM() * 25)::INT) || 
               CHR(65 + (RANDOM() * 25)::INT));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_access_code_2()
RETURNS VARCHAR(6) AS $$
BEGIN
  RETURN LPAD((RANDOM() * 999999)::INT::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Update the handle_new_user function to generate access codes
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    access_code_1, 
    access_code_2, 
    user_role,
    created_at
  )
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'access_code_1', generate_access_code_1()),
    COALESCE(new.raw_user_meta_data->>'access_code_2', generate_access_code_2()),
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role),
    now()
  );
  RETURN new;
END;
$$;