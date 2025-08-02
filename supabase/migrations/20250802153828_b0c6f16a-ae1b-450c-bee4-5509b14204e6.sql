-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Create storage policies for document uploads
CREATE POLICY "Users can upload their own documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all documents" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'documents' AND EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND user_role = 'admin'
));

-- Add processing status and file reference to agent_knowledge
ALTER TABLE agent_knowledge 
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS storage_path text,
ADD COLUMN IF NOT EXISTS original_file_size bigint;