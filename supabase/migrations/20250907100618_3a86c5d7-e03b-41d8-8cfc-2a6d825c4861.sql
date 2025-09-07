-- Add missing updated_at column to agent_configurations table
ALTER TABLE agent_configurations 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_agent_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_agent_configurations_updated_at
  BEFORE UPDATE ON agent_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_configurations_updated_at();