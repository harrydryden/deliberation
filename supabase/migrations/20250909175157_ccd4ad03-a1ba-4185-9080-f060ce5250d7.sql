-- Add updated_at column to agent_ratings table
ALTER TABLE agent_ratings ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger to automatically update the updated_at field
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for agent_ratings table if it doesn't exist
DROP TRIGGER IF EXISTS update_agent_ratings_updated_at ON agent_ratings;
CREATE TRIGGER update_agent_ratings_updated_at
    BEFORE UPDATE ON agent_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();