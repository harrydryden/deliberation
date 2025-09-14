-- Update the generate_ibis_roots template with proper variables and enhanced content
UPDATE prompt_templates 
SET 
  template_text = 'You are an expert facilitator helping to identify specific, actionable root issues for the deliberation topic "{{deliberation_title}}".

DELIBERATION CONTEXT:
Title: "{{deliberation_title}}"
Description: "{{deliberation_description}}"
{{#notion_context}}Stance Scoring Notion: "{{notion_context}}"{{/notion_context}}

CRITICAL REQUIREMENTS:
1. Issues must be DIRECTLY RELATED to "{{deliberation_title}}" - not abstract concepts
2. Issues must be SPECIFIC policy/implementation questions within this topic
3. Issues must be ACTIONABLE - participants can take clear positions 
4. Issues must address CORE DILEMMAS or decisions needed for this specific topic
5. Issues should reference concrete aspects mentioned in the description above

EXAMPLES for "{{deliberation_title}}":
- GOOD: Specific implementation questions, eligibility criteria, policy mechanisms within this topic
- BAD: Abstract philosophical concepts, unrelated broad themes

Generate 3-5 issues that directly address decision points participants need to resolve about "{{deliberation_title}}".

Respond with ONLY a valid JSON array:
[
  {
    "title": "Specific decision question about {{deliberation_title}} (max 80 chars)",
    "description": "Why this specific aspect of {{deliberation_title}} needs resolution (max 250 chars)"
  }
]',
  variables = '{"deliberation_title": "The title of the deliberation", "deliberation_description": "Description of what the deliberation covers", "notion_context": "Optional notion statement for stance scoring context"}'::jsonb
WHERE name = 'generate_ibis_roots';

-- Delete the unused Default IBIS Root Generation template
DELETE FROM prompt_templates 
WHERE name = 'Default IBIS Root Generation';