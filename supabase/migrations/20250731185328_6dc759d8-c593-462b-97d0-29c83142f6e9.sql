-- Enable RLS on facilitator_sessions table
ALTER TABLE facilitator_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for facilitator_sessions
CREATE POLICY "Users can view their own facilitator sessions" 
ON facilitator_sessions 
FOR SELECT 
USING (user_id = auth.uid()::TEXT);

CREATE POLICY "Users can create their own facilitator sessions" 
ON facilitator_sessions 
FOR INSERT 
WITH CHECK (user_id = auth.uid()::TEXT);

CREATE POLICY "Users can update their own facilitator sessions" 
ON facilitator_sessions 
FOR UPDATE 
USING (user_id = auth.uid()::TEXT)
WITH CHECK (user_id = auth.uid()::TEXT);

CREATE POLICY "Admins can view all facilitator sessions" 
ON facilitator_sessions 
FOR SELECT 
USING (is_admin_user(auth.uid()));

-- Fix the function search path issue
CREATE OR REPLACE FUNCTION update_facilitator_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;