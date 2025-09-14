-- Create documents storage bucket if it doesn't exist (this is what the code actually uses)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for documents bucket (what the code actually uses)
CREATE POLICY "Admin users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

CREATE POLICY "Admin users can view documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

CREATE POLICY "Admin users can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' 
  AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- CRITICAL: Allow service role (edge functions) to insert into agent_knowledge
-- Edge functions run under service_role and need to be able to bulk insert knowledge chunks
CREATE POLICY "Service role can insert agent knowledge"
ON agent_knowledge FOR INSERT
WITH CHECK (
  -- Allow service role (used by edge functions) to insert
  auth.role() = 'service_role'
  OR 
  -- Also allow normal users with admin access for direct operations
  (created_by = get_current_access_code_user() AND EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  ))
);

-- Allow service role to select agent knowledge for processing functions
CREATE POLICY "Service role can read agent knowledge"
ON agent_knowledge FOR SELECT
USING (
  auth.role() = 'service_role'
  OR 
  -- Keep existing user access
  created_by = get_current_access_code_user()
);

-- Allow service role to update agent knowledge if needed
CREATE POLICY "Service role can update agent knowledge"
ON agent_knowledge FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR 
  created_by = get_current_access_code_user()
);

-- Allow service role to delete agent knowledge for cleanup
CREATE POLICY "Service role can delete agent knowledge"
ON agent_knowledge FOR DELETE
USING (
  auth.role() = 'service_role'
  OR 
  created_by = get_current_access_code_user()
);