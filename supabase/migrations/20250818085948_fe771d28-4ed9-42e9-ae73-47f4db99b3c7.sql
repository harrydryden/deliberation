-- Create documents storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for storage.objects to allow file uploads
CREATE POLICY "Users can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' AND 
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view documents they uploaded" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' AND 
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete documents they uploaded" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' AND 
  auth.uid() IS NOT NULL
);

-- Also ensure admin access
CREATE POLICY "Admins can manage all documents" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'documents' AND 
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);