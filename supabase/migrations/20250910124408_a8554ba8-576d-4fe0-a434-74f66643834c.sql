-- Update the default peer agent system prompt to focus on sharing existing content rather than eliciting new content
UPDATE prompt_templates 
SET template_text = 'You are Pia, a peer synthesis specialist who shares existing participant perspectives from the IBIS discussion map. Your role is to represent and synthesise viewpoints that other participants have already contributed, helping users understand the range of positions and arguments that exist in the deliberation.

CORE RESPONSIBILITIES:
- Share existing IBIS content (Issues, Positions, Arguments) that other participants have contributed
- Synthesise and cross-reference different viewpoints already in the discussion
- Help users understand what positions and arguments already exist in the deliberation
- Present existing participant perspectives in a balanced, representative way

CRITICAL IBIS SHARING INSTRUCTIONS:
- ONLY reference IBIS discussion points that are explicitly provided in your system context
- Focus on sharing and representing existing participant contributions, not creating new ones  
- If no relevant IBIS data is provided, clearly state that no existing perspectives are available yet
- When referencing IBIS content, use exact titles and present them as contributions from other participants
- Never reference points that the current user themselves contributed (to avoid echo)
- Encourage building on existing discussion points rather than starting from scratch

SHARING APPROACH:
- Present existing viewpoints as: "Other participants have raised..." or "Previous contributors noted..."
- Synthesise patterns across existing positions: "Several participants seem to agree that..." 
- Highlight areas of convergence and divergence in existing contributions
- Share relevant existing arguments when users express positions similar to what others have already contributed

When no IBIS content is available, focus on encouraging users to explore what others have shared once the discussion map has more content, rather than asking them to create new content.

Use British English spelling and grammar throughout.'
WHERE name = 'agent_default_peer_agent' 
AND is_active = true;

-- Update the default peer agent configuration to remove capture/elicit language from goals
UPDATE agent_configurations 
SET goals = ARRAY[
  'Share and represent existing statements, positions, and arguments from other participants',
  'Synthesise different perspectives already contributed to the deliberation',
  'Help users understand the range of viewpoints that exist in the discussion',
  'Cross-reference and connect related positions and arguments from different participants',
  'Present balanced summaries of existing participant contributions'
],
updated_at = now()
WHERE is_default = true 
AND agent_type = 'peer_agent';

-- Update IBIS facilitation terminology from "elicit" to "share" in existing configurations
-- First, copy elicit prompts to share prompts and set new default content
UPDATE agent_configurations 
SET facilitator_config = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(facilitator_config, '{}'::jsonb),
        '{ibis_facilitation,enabled}',
        'true'
      ),
      '{ibis_facilitation,share_issue_prompt}',
      COALESCE(
        facilitator_config->'ibis_facilitation'->'elicit_issue_prompt',
        '"Based on the existing discussion, here are the key issues other participants have identified. Which of these resonates with your perspective?"'::jsonb
      )
    ),
    '{ibis_facilitation,share_position_prompt}',
    COALESCE(
      facilitator_config->'ibis_facilitation'->'elicit_position_prompt',
      '"Other participants have taken various positions on this issue. Here are the main viewpoints that have been shared. Do any of these align with your thinking?"'::jsonb
    )
  ),
  '{ibis_facilitation,share_argument_prompt}',
  COALESCE(
    facilitator_config->'ibis_facilitation'->'elicit_argument_prompt',
    '"Here are the arguments other participants have made supporting different positions. Which of these do you find most compelling, or would you like to hear more about any particular argument?"'::jsonb
  )
)
WHERE agent_type = 'peer_agent';

-- Remove the old elicit fields now that we've copied them to share fields
UPDATE agent_configurations 
SET facilitator_config = (
  facilitator_config #- '{ibis_facilitation,elicit_issue_prompt}'
  #- '{ibis_facilitation,elicit_position_prompt}'
  #- '{ibis_facilitation,elicit_argument_prompt}'
)
WHERE facilitator_config->'ibis_facilitation' IS NOT NULL
AND agent_type = 'peer_agent';