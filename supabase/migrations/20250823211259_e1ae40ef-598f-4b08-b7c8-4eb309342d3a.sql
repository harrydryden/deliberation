-- Create documents storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for documents storage
-- Allow authenticated users to upload files
CREATE POLICY IF NOT EXISTS "Authenticated users can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.role() = 'authenticated'
);

-- Allow users to read their own uploaded files
CREATE POLICY IF NOT EXISTS "Users can read their own documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' 
  AND (auth.uid()::text = (storage.foldername(name))[1] OR auth_is_admin())
);

-- Allow service role (edge functions) full access to documents
CREATE POLICY IF NOT EXISTS "Service role can manage all documents" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'documents' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'documents' AND auth.role() = 'service_role');

-- Allow users to delete their own files
CREATE POLICY IF NOT EXISTS "Users can delete their own documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' 
  AND (auth.uid()::text = (storage.foldername(name))[1] OR auth_is_admin())
);