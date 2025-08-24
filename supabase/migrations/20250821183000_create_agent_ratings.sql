-- Create agent_ratings table for tracking user feedback on agent responses
CREATE TABLE IF NOT EXISTS agent_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)), -- -1 for unhelpful, 1 for helpful
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id) -- Prevent multiple ratings from same user on same message
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_agent_ratings_message_id ON agent_ratings(message_id);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_user_id ON agent_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_rating ON agent_ratings(rating);

-- Enable RLS
ALTER TABLE agent_ratings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own ratings" ON agent_ratings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ratings" ON agent_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings" ON agent_ratings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all ratings" ON agent_ratings
  FOR SELECT USING (auth_is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_agent_ratings_updated_at
  BEFORE UPDATE ON agent_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_ratings_updated_at();

-- Function to get rating summary for a message
CREATE OR REPLACE FUNCTION get_message_rating_summary(message_uuid UUID)
RETURNS TABLE(
  helpful_count BIGINT,
  unhelpful_count BIGINT,
  total_ratings BIGINT,
  user_rating INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END), 0)::BIGINT as helpful_count,
    COALESCE(SUM(CASE WHEN r.rating = -1 THEN 1 ELSE 0 END), 0)::BIGINT as unhelpful_count,
    COALESCE(COUNT(*), 0)::BIGINT as total_ratings,
    COALESCE((
      SELECT rating
      FROM agent_ratings
      WHERE message_id = message_uuid AND user_id = auth.uid()
      LIMIT 1
    ), 0) as user_rating;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
