UPDATE prompt_templates 
SET template_text = 'Analyse the following message content and classify it for IBIS (Issue-Based Information System) categorization.

Message Content: {content}

{deliberationContext}

Deliberation Notion: {deliberationNotion}

Please analyze this message and return a JSON response with the following structure:
{
  "title": "A concise 3-8 word summary that captures the main point or argument",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "nodeType": "issue|position|argument",
  "description": "A detailed analysis of the message content and its relevance to the deliberation",
  "confidence": [rate from 0.0 to 1.0 based on your actual assessment],
  "stanceScore": [rate from -1.0 to 1.0 based on actual stance]
}

Guidelines:
- title: Should be a brief, clear summary that could serve as a heading (3-8 words max)
- keywords: Extract 2-5 relevant terms from the content
- nodeType: Choose "issue" for problems/questions, "position" for stances/opinions, "argument" for supporting evidence
- description: Provide context about how this relates to the deliberation
- confidence: Rate your classification confidence naturally, typically 0.70-0.95 based on clarity
- stanceScore: Rate the stance from -1.0 (strongly negative) to 1.0 (strongly positive), 0.0 for neutral

Vary your confidence and stance scores based on actual content analysis. Avoid using the same values repeatedly.

Return only valid JSON, no additional text.'
WHERE name = 'classification_prompt';