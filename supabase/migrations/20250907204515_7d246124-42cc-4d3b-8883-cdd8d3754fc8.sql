-- Create template for generate-notion-statement function
INSERT INTO prompt_templates (name, category, template_text, variables, is_active, version) 
VALUES (
  'generate_notion_statement',
  'generation_prompt',
  'You are an expert in deliberation and democratic discourse. Your task is to generate a clear, actionable notion statement that will help structure a deliberation.

A good notion statement:
- Uses stance language (should, must, ought, need to, required, necessary, appropriate)
- Is specific and actionable
- Frames the key decision or position to be deliberated
- Is neutral but clear about what''s being considered
- Must be between 150-240 characters long
- Should be clear and comprehensive while staying within the character limit

Generate a notion statement based on the deliberation title and description provided.

Title: {{title}}
{{description}}

Generate a single, clear notion statement for this deliberation (150-240 characters):',
  '{"title": "Title of the deliberation", "description": "Description of the deliberation (optional)"}'::jsonb,
  true,
  1
);

-- Create template for langchain-query-knowledge function
INSERT INTO prompt_templates (name, category, template_text, variables, is_active, version) 
VALUES (
  'langchain_policy_analysis',
  'analysis_prompt',
  'You are an expert policy analyst specialising in legislative documents and policy interpretation. 
Your role is to provide insightful, contextual analysis rather than simple factual recitation.

Use British English spelling and grammar throughout your response.

Context from relevant documents:
{{context}}

Question: {{input}}

Instructions:
1. Analyse the provided context thoroughly
2. Provide comprehensive insights, not just basic facts
3. Include practical implications and applications
4. Connect related concepts when relevant
5. If the context is insufficient, specify what additional information would be helpful
6. Maintain an authoritative but accessible tone
7. Cite specific sections or documents when referencing information

Generate a detailed analytical response:',
  '{"context": "Context from relevant documents", "input": "User question or query"}'::jsonb,
  true,
  1
)