-- Create storage bucket for knowledge files if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('knowledge', 'knowledge', false, 52428800, ARRAY['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for knowledge bucket
CREATE POLICY "Admin users can upload knowledge files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

CREATE POLICY "Admin users can view knowledge files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'knowledge' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

CREATE POLICY "Admin users can update knowledge files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'knowledge' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

CREATE POLICY "Admin users can delete knowledge files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'knowledge' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- Also create a policy for users to upload to their own folder in knowledge bucket
CREATE POLICY "Users can upload to their own knowledge folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can view their own knowledge files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Users can delete their own knowledge files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'knowledge' 
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);