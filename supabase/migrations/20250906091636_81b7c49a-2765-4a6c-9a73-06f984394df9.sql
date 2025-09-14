-- Update user_sessions table to have proper RLS policies
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view their own sessions" 
ON user_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own sessions (for authenticated users)
CREATE POLICY "Users can create their own sessions" 
ON user_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions (for activity tracking)
CREATE POLICY "Users can update their own sessions" 
ON user_sessions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Admins can manage all sessions
CREATE POLICY "Admins can manage all sessions" 
ON user_sessions 
FOR ALL 
USING (auth_is_admin());