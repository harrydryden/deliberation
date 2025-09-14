-- Create the missing classification_prompt template
INSERT INTO prompt_templates (
  name,
  category,
  description,
  template_text,
  variables,
  is_active,
  is_default,
  version
) VALUES (
  'classification_prompt',
  'classification',
  'Prompt template for AI message classification and IBIS node generation',
  'Analyze the following message content and classify it for IBIS (Issue-Based Information System) categorization.

Message Content: {content}

{deliberationContext}

Deliberation Notion: {deliberationNotion}

Please analyze this message and return a JSON response with the following structure:
{
  "title": "A concise 3-8 word summary that captures the main point or argument",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "nodeType": "issue|position|argument",
  "description": "A detailed analysis of the message content and its relevance to the deliberation",
  "confidence": 0.85,
  "stanceScore": 0.2
}

Guidelines:
- title: Should be a brief, clear summary that could serve as a heading (3-8 words max)
- keywords: Extract 2-5 relevant terms from the content
- nodeType: Choose "issue" for problems/questions, "position" for stances/opinions, "argument" for supporting evidence
- description: Provide context about how this relates to the deliberation
- confidence: Rate your classification confidence from 0.0 to 1.0
- stanceScore: Rate the stance from -1.0 (strongly negative) to 1.0 (strongly positive), 0.0 for neutral

Return only valid JSON, no additional text.',
  '["content", "deliberationContext", "deliberationNotion"]'::jsonb,
  true,
  true,
  1
);