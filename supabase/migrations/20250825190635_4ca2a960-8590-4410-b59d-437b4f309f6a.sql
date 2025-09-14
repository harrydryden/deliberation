-- Create storage policies for document uploads
-- Insert the documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT (id) DO NOTHING;

-- Create policy for authenticated users to upload documents
CREATE POLICY "Authenticated users can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

-- Create policy for authenticated users to view their own documents
CREATE POLICY "Users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create policy for service role to access all documents (for edge functions)
CREATE POLICY "Service role can access all documents" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'documents');

-- Update documents bucket to allow authenticated users
UPDATE storage.buckets 
SET public = false, 
    file_size_limit = 52428800, -- 50MB limit
    allowed_mime_types = ARRAY['application/pdf', 'text/plain', 'text/markdown'] 
WHERE id = 'documents';