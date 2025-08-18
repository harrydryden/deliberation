-- Restrict agent knowledge uploads to admins only
-- Users should only access knowledge through bill_agent, not upload directly

-- Drop existing user policies that allow direct knowledge management
DROP POLICY IF EXISTS "Access code users can create agent knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Access code users can delete their own agent knowledge" ON agent_knowledge;  
DROP POLICY IF EXISTS "Access code users can view agent knowledge they created" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can create agent knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can delete their own agent knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can view agent knowledge they created" ON agent_knowledge;

-- Create new restricted policy: Users can only READ agent knowledge (for bill_agent queries)
-- but cannot create, update, or delete it
CREATE POLICY "Users can read agent knowledge for queries" ON agent_knowledge
FOR SELECT
USING (
  -- Allow service role (for edge functions like bill_agent queries)
  auth.role() = 'service_role' OR
  -- Allow admins to read everything
  EXISTS (
    SELECT 1 FROM access_codes 
    WHERE code = get_current_user_access_code() 
    AND code_type = 'admin' 
    AND is_active = true
  )
);

-- Keep admin policies (admins can manage all knowledge)
-- Keep service role policies (needed for edge function operations)

-- Update storage policies to restrict knowledge uploads to admins only
DROP POLICY IF EXISTS "Users can upload to their own folder in knowledge" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files in knowledge" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files in knowledge" ON storage.objects;

-- Only admins can manage knowledge files in storage
-- (Admins can manage all files policy already exists and covers this)