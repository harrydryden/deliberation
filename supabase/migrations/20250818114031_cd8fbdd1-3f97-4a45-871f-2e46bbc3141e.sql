-- Step 3: Update storage policies to use auth.uid()
DROP POLICY IF EXISTS "Access code users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Access code users can view their documents" ON storage.objects;
DROP POLICY IF EXISTS "Access code users can update their documents" ON storage.objects;
DROP POLICY IF EXISTS "Access code users can delete their documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;

-- Create new storage policies using auth.uid()
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can manage all documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'documents' AND
  public.is_admin()
)
WITH CHECK (
  bucket_id = 'documents' AND
  public.is_admin()
);