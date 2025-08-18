-- Drop the incorrect RLS policies that use auth.uid()
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents they uploaded" ON storage.objects;  
DROP POLICY IF EXISTS "Users can delete documents they uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;

-- Create correct RLS policies using access code system
CREATE POLICY "Access code users can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' AND 
  get_current_access_code_user() IS NOT NULL
);

CREATE POLICY "Access code users can view documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' AND 
  get_current_access_code_user() IS NOT NULL
);

CREATE POLICY "Access code users can delete documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' AND 
  get_current_access_code_user() IS NOT NULL
);

CREATE POLICY "Access code admins can manage all documents" 
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