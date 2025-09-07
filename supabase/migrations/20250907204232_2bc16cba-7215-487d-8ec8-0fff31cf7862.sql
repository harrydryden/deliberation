-- Update evaluate_ibis_relationships template with detailed prompt
UPDATE prompt_templates 
SET template_text = 'Context: This is a democratic deliberation about "{{deliberation_title}}".
{{deliberation_notion}}

New Contribution:
Type: {{node_type}}
Title: {{title}}
Content: {{content}}

Evaluate relationships with these existing contributions:
{{existing_contributions}}

For each existing contribution that has a meaningful relationship, provide:
1. Relationship type: {{valid_relationship_types}}
2. Confidence score (0.0-1.0)
3. Brief reasoning (1 sentence)

Only suggest relationships with confidence > 0.6. Focus on logical and argumentative relationships, not just topical similarity.

Respond in JSON format:
{
  "relationships": [
    {
      "nodeIndex": number,
      "relationshipType": "string", 
      "confidence": number,
      "reasoning": "string"
    }
  ]
}',
    variables = '{"deliberation_title": "Title of the deliberation", "deliberation_notion": "Key question or notion statement", "node_type": "Type of the new node", "title": "Title of new contribution", "content": "Content of new contribution", "existing_contributions": "List of existing contributions to evaluate", "valid_relationship_types": "Valid relationship types for this node type"}'::jsonb
WHERE name = 'evaluate_ibis_relationships' AND is_active = true;

-- Update generate_proactive_prompts template with detailed prompt  
UPDATE prompt_templates 
SET template_text = '{{flow_system_prompt}}

CURRENT DELIBERATION CONTEXT:
- Topic: {{deliberation_title}}
- Description: {{deliberation_description}}
- Notion statement: {{deliberation_notion}}
- User engagement: {{user_engagement}} messages, last type: {{last_message_type}}
- Recent conversation:
{{conversation_summary}}

{{session_context}}

PROACTIVE FACILITATION TASK: 
Generate a thoughtful, engaging proactive prompt to re-engage this user who has been inactive. The prompt should align with your facilitation style and goals while being:

1. Contextually relevant to the ongoing discussion
2. {{user_experience_guidance}}
3. {{session_phase_guidance}}
4. {{engagement_level_guidance}}
5. Encouraging but not pushy
6. Offering specific, actionable ways to contribute
7. Concise (1-2 sentences)

Consider these contexts:
- If new participant: Welcome and guide them with specific first steps
- If experienced participant: Build on their previous contributions and session history
- If discussion is quiet: Encourage broader participation with specific conversation starters
- If discussion is active: Help them catch up or add fresh perspective
- If extended session: Acknowledge their dedication and suggest high-value contributions

Respond with JSON in this format:
{
  "question": "Your engaging proactive prompt here",
  "context": "engagement|onboarding|catch_up|perspective|extended_session"
}',
    variables = '{"flow_system_prompt": "System prompt from flow agent", "deliberation_title": "Title of deliberation", "deliberation_description": "Description of deliberation", "deliberation_notion": "Notion statement", "user_engagement": "Number of user messages", "last_message_type": "Type of last message", "conversation_summary": "Summary of recent conversation", "session_context": "Enhanced session context if available", "user_experience_guidance": "Guidance based on user experience level", "session_phase_guidance": "Guidance based on session phase", "engagement_level_guidance": "Guidance based on engagement level"}'::jsonb
WHERE name = 'generate_proactive_prompts' AND is_active = true