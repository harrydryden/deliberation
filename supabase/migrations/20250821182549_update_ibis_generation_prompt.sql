-- Create prompt_templates table for managing AI prompts
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  template_text TEXT NOT NULL,
  variables JSONB, -- Template variables and their descriptions
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deliberation_id UUID REFERENCES deliberations(id) ON DELETE SET NULL, -- NULL for global templates
  metadata JSONB, -- Additional template metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient lookups
-- Note: Indexes will be created after the table is created

-- Enable RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view active global templates" ON prompt_templates
  FOR SELECT USING (is_active = true AND deliberation_id IS NULL);

CREATE POLICY "Users can view templates in their deliberations" ON prompt_templates
  FOR SELECT USING (
    deliberation_id IS NULL OR
    EXISTS (
      SELECT 1 FROM deliberation_participants dp 
      WHERE dp.deliberation_id = prompt_templates.deliberation_id 
      AND dp.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all templates" ON prompt_templates
  FOR ALL USING (auth_is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_prompt_templates_updated_at();

-- Create indexes after table creation
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_deliberation ON prompt_templates(deliberation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_version ON prompt_templates(version);

-- Insert default IBIS generation prompt
INSERT INTO prompt_templates (name, description, category, template_text, variables) VALUES (
  'Default IBIS Root Generation',
  'Default prompt for generating IBIS root nodes from user submissions',
  'ibis_generation',
  'Analyze the following user submission and generate up to 2 IBIS root issues that best represent the core concerns or topics discussed. Each issue should be:

1. **Specific and focused** - Avoid overly broad or vague statements
2. **Actionable** - Something that can be discussed, debated, or resolved
3. **Relevant** - Directly related to the user''s submission content
4. **Clear** - Easy to understand and discuss

User Submission: {{user_submission}}

Please format your response as:
- Issue 1: [Title] - [Brief description]
- Issue 2: [Title] - [Brief description]

If the submission doesn''t clearly suggest specific issues, respond with "No clear issues identified."',
  '{"user_submission": "The user''s submitted text content"}'
) ON CONFLICT (name) DO NOTHING;

-- Insert default issue recommendation prompt
INSERT INTO prompt_templates (name, description, category, template_text, variables) VALUES (
  'Issue Recommendation System',
  'Prompt for recommending relevant IBIS issues to users based on their submissions',
  'issue_recommendation',
  'Based on the following user submission, recommend up to 2 existing IBIS issues that are most relevant to their content. Consider:

1. **Semantic similarity** - How closely the submission relates to each issue
2. **Topic alignment** - Whether the submission addresses the same core topic
3. **Relevance score** - How directly the submission contributes to the issue

User Submission: {{user_submission}}

Available Issues:
{{available_issues}}

Please respond with:
- Recommended Issue 1: [Issue Title] - [Relevance Score 0.0-1.0] - [Brief explanation]
- Recommended Issue 2: [Issue Title] - [Relevance Score 0.0-1.0] - [Brief explanation]

If no issues are sufficiently relevant (relevance < 0.6), respond with "No relevant issues found."',
  '{"user_submission": "The user''s submitted text content", "available_issues": "List of existing IBIS issues with titles and descriptions"}'
) ON CONFLICT (name) DO NOTHING;

-- Function to get template with variable substitution
CREATE OR REPLACE FUNCTION get_prompt_template(template_name VARCHAR, template_variables JSONB DEFAULT '{}')
RETURNS TABLE(
  template_text TEXT,
  variables JSONB,
  category VARCHAR,
  version INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.template_text,
    pt.variables,
    pt.category,
    pt.version
  FROM prompt_templates pt
  WHERE pt.name = template_name
    AND pt.is_active = true
  ORDER BY pt.version DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
