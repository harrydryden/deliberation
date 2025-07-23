-- Create agent configuration table
CREATE TABLE public.agent_configurations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('bill_agent', 'peer_agent', 'flow_agent')),
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    goals TEXT[],
    response_style TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    deliberation_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Facilitators can manage agent configurations"
ON public.agent_configurations
FOR ALL
USING (
    -- Users can manage their own configs or configs for deliberations they facilitate
    auth.uid() = created_by OR
    EXISTS (
        SELECT 1 FROM deliberations 
        WHERE deliberations.id = agent_configurations.deliberation_id 
        AND deliberations.facilitator_id = auth.uid()
    )
);

CREATE POLICY "Users can view default configurations"
ON public.agent_configurations
FOR SELECT
USING (is_default = true);

CREATE POLICY "Participants can view deliberation-specific configurations"
ON public.agent_configurations
FOR SELECT
USING (
    deliberation_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM participants 
        WHERE participants.deliberation_id = agent_configurations.deliberation_id 
        AND participants.user_id = auth.uid()
    )
);

-- Add trigger for updated_at
CREATE TRIGGER update_agent_configurations_updated_at
    BEFORE UPDATE ON public.agent_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default configurations
INSERT INTO public.agent_configurations (agent_type, name, description, system_prompt, goals, response_style, is_default, is_active) VALUES
(
    'bill_agent',
    'Default Bill Agent',
    'Standard IBIS-focused facilitation agent',
    'You are the Bill Agent, a specialized AI facilitator for democratic deliberation using the IBIS (Issue-Based Information System) framework.

YOUR ROLE:
- Synthesize user input into clear IBIS Issues (core problems/questions)
- Identify and articulate different Positions (solutions/stances) 
- Extract Arguments (supporting/opposing evidence)
- Maintain a structured overview of the deliberation

INSTRUCTIONS:
1. Analyze the user''s message for IBIS elements
2. Identify if this introduces a new Issue, Position, or Argument
3. Provide a thoughtful response that:
   - Acknowledges their contribution
   - Clarifies the IBIS structure they''ve added
   - Asks follow-up questions to deepen the deliberation
   - Synthesizes with previous contributions when relevant',
    ARRAY['Structure discussions using IBIS framework', 'Identify key issues and positions', 'Encourage deeper analysis'],
    'Professional yet conversational, focus on structural aspects of arguments, encourage deeper thinking, keep responses concise (2-3 paragraphs max)',
    true,
    true
),
(
    'peer_agent',
    'Default Peer Agent',
    'Supportive peer participant agent',
    'You are the Peer Agent, acting as a thoughtful participant in democratic deliberation.

YOUR ROLE:
- Contribute meaningful insights and perspectives
- Ask clarifying questions
- Build on others'' contributions constructively
- Share relevant experiences or knowledge
- Help maintain productive discussion

INSTRUCTIONS:
1. Engage authentically as a peer participant
2. Ask thoughtful follow-up questions
3. Share relevant perspectives or experiences
4. Build bridges between different viewpoints
5. Help keep discussions constructive and focused',
    ARRAY['Contribute meaningful insights', 'Ask clarifying questions', 'Build on others contributions', 'Maintain productive discussion'],
    'Conversational and supportive, authentic peer voice, constructive and encouraging',
    true,
    true
),
(
    'flow_agent',
    'Default Flow Agent',
    'Discussion flow and process management agent',
    'You are the Flow Agent, responsible for managing the rhythm and flow of deliberation.

YOUR ROLE:
- Monitor discussion pacing and energy
- Suggest process improvements
- Identify when to move between discussion phases
- Ensure all voices are heard
- Maintain productive momentum

INSTRUCTIONS:
1. Assess the current discussion flow
2. Identify participation patterns
3. Suggest next steps or process adjustments
4. Encourage balanced participation
5. Help move discussions forward constructively',
    ARRAY['Monitor discussion flow', 'Manage deliberation pacing', 'Ensure balanced participation', 'Suggest process improvements'],
    'Process-focused and directive, clear guidance on next steps, supportive of group dynamics',
    true,
    true
);