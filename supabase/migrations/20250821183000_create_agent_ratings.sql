-- Create agent_ratings table for user feedback on agent messages
CREATE TABLE IF NOT EXISTS agent_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)), -- -1 for unhelpful, 1 for helpful
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id) -- One rating per user per message
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agent_ratings_message_id ON agent_ratings(message_id);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_user_id ON agent_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_rating ON agent_ratings(rating);
CREATE INDEX IF NOT EXISTS idx_agent_ratings_created_at ON agent_ratings(created_at);

-- Enable RLS
ALTER TABLE agent_ratings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view ratings for messages in their deliberations" ON agent_ratings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN participants p ON p.deliberation_id = m.deliberation_id
      WHERE m.id = agent_ratings.message_id
      AND p.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create ratings for messages in their deliberations" ON agent_ratings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN participants p ON p.deliberation_id = m.deliberation_id
      WHERE m.id = agent_ratings.message_id
      AND p.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update their own ratings" ON agent_ratings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all ratings" ON agent_ratings
  FOR ALL USING (auth_is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_agent_ratings_updated_at
  BEFORE UPDATE ON agent_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_ratings_updated_at();

-- Function to get message rating summary
CREATE OR REPLACE FUNCTION get_message_rating_summary(message_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS TABLE(
  total_ratings BIGINT,
  helpful_count BIGINT,
  unhelpful_count BIGINT,
  helpful_percentage DECIMAL(5,2),
  average_rating DECIMAL(3,2),
  user_rating INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_ratings,
    COUNT(*) FILTER (WHERE rating = 1)::BIGINT as helpful_count,
    COUNT(*) FILTER (WHERE rating = -1)::BIGINT as unhelpful_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        (COUNT(*) FILTER (WHERE rating = 1) * 100.0 / COUNT(*))::DECIMAL(5,2)
      ELSE 0::DECIMAL(5,2)
    END as helpful_percentage,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        AVG(rating)::DECIMAL(3,2)
      ELSE 0::DECIMAL(3,2)
    END as average_rating,
    COALESCE(
      (SELECT rating FROM agent_ratings 
       WHERE message_id = message_uuid AND user_id = user_uuid 
       LIMIT 1), 
      0
    )::INTEGER as user_rating
  FROM agent_ratings
  WHERE message_id = message_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
