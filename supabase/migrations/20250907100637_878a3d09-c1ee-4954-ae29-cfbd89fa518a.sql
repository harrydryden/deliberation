-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_agent_configurations_updated_at ON agent_configurations;

-- Add missing updated_at column to agent_configurations table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'agent_configurations' 
                   AND column_name = 'updated_at') THEN
        ALTER TABLE agent_configurations 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
END $$;

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