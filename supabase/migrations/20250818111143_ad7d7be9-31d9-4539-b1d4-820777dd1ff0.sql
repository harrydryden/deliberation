-- Fix storage policies to work with header-based authentication
-- This resolves the "new row violates row-level security policy for table objects" error

-- Drop existing storage policies
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;

-- Create new storage policies using header-based auth functions
-- Note: Storage policies need to handle both admin users and regular users

-- Policy for document uploads (knowledge files)
CREATE POLICY "Admins can manage all storage objects"
ON storage.objects
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- Policy for users to upload files in their own folder
CREATE POLICY "Users can upload to their own folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  -- Admin users can upload anywhere
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
  OR
  -- Regular users can upload to folders that start with their user ID
  (
    (current_setting('request.headers', true)::json->>'x-access-code') IS NOT NULL
    AND bucket_id IN ('documents', 'agent-knowledge', 'avatars')
    AND (storage.foldername(name))[1] = (
      SELECT used_by::text FROM access_codes 
      WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
      AND is_active = true
    )
  )
);

-- Policy for users to read files they have access to
CREATE POLICY "Users can read accessible files"
ON storage.objects
FOR SELECT
USING (
  -- Admin users can read everything
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
  OR
  -- Public buckets are readable by everyone
  bucket_id IN ('avatars')
  OR
  -- Users can read files in their own folders
  (
    (current_setting('request.headers', true)::json->>'x-access-code') IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT used_by::text FROM access_codes 
      WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
      AND is_active = true
    )
  )
);

-- Policy for users to update/delete their own files
CREATE POLICY "Users can modify their own files"
ON storage.objects
FOR UPDATE
USING (
  -- Admin users can update everything
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
  OR
  -- Users can update files in their own folders
  (
    (current_setting('request.headers', true)::json->>'x-access-code') IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT used_by::text FROM access_codes 
      WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
      AND is_active = true
    )
  )
)
WITH CHECK (
  -- Admin users can update everything
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
  OR
  -- Users can update files in their own folders
  (
    (current_setting('request.headers', true)::json->>'x-access-code') IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT used_by::text FROM access_codes 
      WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
      AND is_active = true
    )
  )
);

-- Policy for users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
USING (
  -- Admin users can delete everything
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
    AND code_type = 'admin' 
    AND is_active = true
  )
  OR
  -- Users can delete files in their own folders
  (
    (current_setting('request.headers', true)::json->>'x-access-code') IS NOT NULL
    AND (storage.foldername(name))[1] = (
      SELECT used_by::text FROM access_codes 
      WHERE code = (current_setting('request.headers', true)::json->>'x-access-code')
      AND is_active = true
    )
  )
);

-- Ensure required storage buckets exist
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('documents', 'documents', false),
  ('agent-knowledge', 'agent-knowledge', false),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;