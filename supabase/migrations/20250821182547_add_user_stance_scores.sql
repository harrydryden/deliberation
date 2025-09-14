-- Create user_stance_scores table for tracking user sentiment towards deliberation topics
CREATE TABLE IF NOT EXISTS user_stance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deliberation_id UUID NOT NULL REFERENCES deliberations(id) ON DELETE CASCADE,
  stance_score DECIMAL(3,2) NOT NULL CHECK (stance_score >= -1.0 AND stance_score <= 1.0), -- -1.0 (negative) to 1.0 (positive)
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0), -- 0.0 (uncertain) to 1.0 (certain)
  semantic_analysis JSONB, -- Store detailed semantic analysis results
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, deliberation_id) -- One stance score per user per deliberation
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_stance_scores_user_id ON user_stance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stance_scores_deliberation_id ON user_stance_scores(deliberation_id);
CREATE INDEX IF NOT EXISTS idx_user_stance_scores_stance_score ON user_stance_scores(stance_score);
CREATE INDEX IF NOT EXISTS idx_user_stance_scores_confidence_score ON user_stance_scores(confidence_score);

-- Enable RLS
ALTER TABLE user_stance_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own stance scores" ON user_stance_scores
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stance scores" ON user_stance_scores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stance scores" ON user_stance_scores
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all stance scores" ON user_stance_scores
  FOR SELECT USING (auth_is_admin());

CREATE POLICY "Admins can update all stance scores" ON user_stance_scores
  FOR UPDATE USING (auth_is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_stance_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_user_stance_scores_updated_at
  BEFORE UPDATE ON user_stance_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stance_scores_updated_at();

-- Function to calculate overall deliberation stance
CREATE OR REPLACE FUNCTION get_deliberation_stance_summary(deliberation_uuid UUID)
RETURNS TABLE(
  total_users BIGINT,
  average_stance DECIMAL(3,2),
  positive_users BIGINT,
  negative_users BIGINT,
  neutral_users BIGINT,
  average_confidence DECIMAL(3,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_users,
    AVG(stance_score)::DECIMAL(3,2) as average_stance,
    COUNT(CASE WHEN stance_score > 0.1 THEN 1 END)::BIGINT as positive_users,
    COUNT(CASE WHEN stance_score < -0.1 THEN 1 END)::BIGINT as negative_users,
    COUNT(CASE WHEN stance_score >= -0.1 AND stance_score <= 0.1 THEN 1 END)::BIGINT as neutral_users,
    AVG(confidence_score)::DECIMAL(3,2) as average_confidence
  FROM user_stance_scores
  WHERE deliberation_id = deliberation_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's stance trend over time
CREATE OR REPLACE FUNCTION get_user_stance_trend(user_uuid UUID, deliberation_uuid UUID)
RETURNS TABLE(
  date DATE,
  stance_score DECIMAL(3,2),
  confidence_score DECIMAL(3,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(updated_at) as date,
    stance_score,
    confidence_score
  FROM user_stance_scores
  WHERE user_id = user_uuid AND deliberation_id = deliberation_uuid
  ORDER BY updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
