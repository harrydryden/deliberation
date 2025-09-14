-- Clean up and consolidate storage policies for consistent access code authentication

-- Drop all existing storage policies to start clean
DROP POLICY IF EXISTS "Access code admins can manage all documents" ON storage.objects;
DROP POLICY IF EXISTS "Access code users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Access code users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Access code users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can manage all documents" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can manage all knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents to their folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload knowledge to their folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;

-- Create new simplified storage policies for documents bucket
-- Admin policies - Admins can manage everything
CREATE POLICY "Admins can manage all files" ON storage.objects
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- User policies for documents bucket - Users can only access their own folder
CREATE POLICY "Users can view their own files in documents" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can upload to their own folder in documents" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can delete their own files in documents" ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

-- User policies for knowledge bucket - Users can only access their own folder
CREATE POLICY "Users can view their own files in knowledge" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can upload to their own folder in knowledge" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can delete their own files in knowledge" ON storage.objects
FOR DELETE
USING (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);