-- Drop the problematic function completely
DROP FUNCTION IF EXISTS update_prompt_templates_updated_at();

-- Now update the template
UPDATE prompt_templates 
SET template_text = 'You are analysing user content to recommend existing issues from a deliberation discussion. Your task is to find the most relevant existing issues that the user''s content relates to.

USER CONTENT:
"{{user_content}}"

EXISTING ISSUES:
{{existing_issues}}

Please analyse the user''s content and identify the {{max_recommendations}} most relevant existing issues. For each recommendation, provide:
1. The exact issue ID (from the list above)
2. A relevance score between 0.6-1.0 (only recommend if score >= 0.6)  
3. A clear explanation of why this issue is relevant to the user''s content

Respond with a JSON array in this exact format:
[
  {
    "issueId": "exact-uuid-from-list", 
    "relevanceScore": 0.85,
    "explanation": "This issue directly relates to the user''s concern about..."
  }
]

Only include issues with relevance score >= 0.6. If no issues meet this threshold, return an empty array [].',
    variables = '{"user_content": "The user''s submission text", "existing_issues": "Formatted list of issues with IDs, titles and descriptions", "max_recommendations": "Maximum number of recommendations to return"}'::jsonb
WHERE name = 'Issue Recommendation System' AND is_active = true