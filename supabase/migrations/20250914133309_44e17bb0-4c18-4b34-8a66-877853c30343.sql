-- Add missing prompt templates that are referenced in edge functions

-- Template for user stance calculation
INSERT INTO prompt_templates (name, category, template_text, variables, description, is_active, version)
VALUES (
  'stance_calculation_system_prompt',
  'analysis',
  'You are an expert analyst tasked with calculating a user''s stance on a deliberation topic.

Deliberation: "{{deliberation_title}}"
{{deliberation_description}}

Analyze the user''s messages and determine their stance on a scale from -1.0 (strongly opposed) to +1.0 (strongly supportive).

Consider:
1. Direct statements of support or opposition
2. Arguments made for or against specific positions
3. Emotional tone and language choices
4. Consistency across multiple messages
5. Engagement with counterarguments

Provide your analysis in JSON format:
{
  "stance_score": -1.0 to 1.0,
  "confidence_score": 0.0 to 1.0,
  "reasoning": "Detailed explanation of the stance calculation",
  "key_indicators": ["specific phrases or arguments that influenced the score"],
  "sentiment_analysis": {
    "overall_tone": "positive|negative|neutral",
    "emotional_intensity": 0.0 to 1.0
  }
}',
  '[
    {"name": "deliberation_title", "type": "string", "required": true, "description": "Title of the deliberation"},
    {"name": "deliberation_description", "type": "string", "required": false, "description": "Description of the deliberation topic"},
    {"name": "user_messages_count", "type": "string", "required": false, "description": "Number of user messages being analyzed"}
  ]',
  'System prompt for calculating user stance scores on deliberation topics',
  true,
  1
) ON CONFLICT (name) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables;

-- Template for IBIS relationship evaluation system prompt
INSERT INTO prompt_templates (name, category, template_text, variables, description, is_active, version)
VALUES (
  'relationship_evaluation_system_prompt',
  'ibis',
  'You are an expert analyst evaluating relationships between IBIS (Issue-Based Information System) nodes in a deliberation.

Analyze the provided content and identify relationships with existing nodes. Consider:
1. Conceptual similarity and thematic connections
2. Logical dependencies (supports, challenges, elaborates)
3. Temporal relationships (builds on, responds to)
4. Hierarchical relationships (parent-child, sibling)
5. Argumentative relationships (evidence, counter-argument)

Node Types:
- issue: Questions or problems to be addressed
- position: Stances or viewpoints on issues
- argument: Evidence, reasoning, or support for positions

Content Analysis Context:
{{include_all_types}}

Return a JSON array of relationship objects with this structure:
[
  {
    "targetNodeId": "node_id",
    "targetNodeTitle": "Node Title",
    "relationshipType": "supports|challenges|elaborates|builds_on|responds_to|evidence|counter_argument|similar|parent|child|sibling",
    "strength": 0.0-1.0,
    "reasoning": "Brief explanation of the relationship",
    "confidence": 0.0-1.0
  }
]',
  '[
    {"name": "include_all_types", "type": "string", "required": false, "description": "Instructions for relationship scope"}
  ]',
  'System prompt for evaluating IBIS node relationships',
  true,
  1
) ON CONFLICT (name) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables;

-- Template for IBIS relationship evaluation user prompt
INSERT INTO prompt_templates (name, category, template_text, variables, description, is_active, version)
VALUES (
  'relationship_evaluation_user_prompt',
  'ibis',
  'Content to analyze:
Title: {{title}}
Type: {{node_type}}
Content: {{content}}

Existing nodes in deliberation:
{{node_context}}

{{include_all_types}}

Identify the most relevant relationships (limit to top 5).',
  '[
    {"name": "title", "type": "string", "required": true, "description": "Title of the node being analyzed"},
    {"name": "node_type", "type": "string", "required": true, "description": "Type of the IBIS node"},
    {"name": "content", "type": "string", "required": true, "description": "Content of the node being analyzed"},
    {"name": "node_context", "type": "string", "required": true, "description": "Context of existing nodes for comparison"},
    {"name": "include_all_types", "type": "string", "required": false, "description": "Instructions for relationship scope"}
  ]',
  'User prompt for evaluating IBIS node relationships',
  true,
  1
) ON CONFLICT (name) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables;