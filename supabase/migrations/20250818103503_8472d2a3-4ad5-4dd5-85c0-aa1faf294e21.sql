-- Drop the incorrect storage policies that were using the wrong context
DROP POLICY IF EXISTS "Admin users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can upload knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can view knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can update knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can delete knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own knowledge folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own knowledge files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own knowledge files" ON storage.objects;

-- Create correct storage policies that work with the access code system
-- Users can upload documents if they have a valid access code and the file is in their folder
CREATE POLICY "Users can upload documents to their folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

-- Users can view documents in their folder
CREATE POLICY "Users can view their documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

-- Users can delete documents in their folder
CREATE POLICY "Users can delete their documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

-- Admin users can manage all documents
CREATE POLICY "Admin users can manage all documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'documents' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- Same policies for knowledge bucket (in case it's used)
CREATE POLICY "Users can upload knowledge to their folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can view their knowledge files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can delete their knowledge files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Admin users can manage all knowledge files"
ON storage.objects FOR ALL
USING (
  bucket_id = 'knowledge' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);