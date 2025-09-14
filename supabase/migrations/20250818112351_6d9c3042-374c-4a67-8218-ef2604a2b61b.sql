-- Create storage bucket for documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies that may be incompatible
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Create storage policies compatible with access code authentication
CREATE POLICY "Access code users can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' 
  AND get_current_access_code_user() IS NOT NULL
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Access code users can view their documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' 
  AND (
    get_current_access_code_user() IS NOT NULL
    AND (storage.foldername(name))[1] = get_current_access_code_user()::text
  )
);

CREATE POLICY "Access code users can update their documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'documents' 
  AND get_current_access_code_user() IS NOT NULL
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

CREATE POLICY "Access code users can delete their documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' 
  AND get_current_access_code_user() IS NOT NULL
  AND (storage.foldername(name))[1] = get_current_access_code_user()::text
);

-- Create admin access policy for storage
CREATE POLICY "Admins can manage all documents" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'documents' 
  AND is_authenticated_admin()
)
WITH CHECK (
  bucket_id = 'documents' 
  AND is_authenticated_admin()
);