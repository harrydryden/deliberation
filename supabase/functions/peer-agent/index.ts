import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  corsHeaders, 
  createSupabaseClient, 
  getRecentMessages, 
  getAgentConfig, 
  callAnthropicAPI, 
  saveAgentMessage,
  buildSystemPrompt,
  type AgentContext
} from '../shared/agent-utils.ts';
import { buildPeerAgentPrompt } from '../shared/prompt-builders.ts';
import { 
  findRelevantPeerPerspectives, 
  getPeerStatements, 
  getIbisNodes, 
  buildIbisContext, 
  buildPeerContext 
} from '../shared/peer-utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const context: AgentContext = await req.json();
    const { message_id, content, user_id, input_type, session_state } = context;
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabase = createSupabaseClient();

    // Get agent configuration and context in parallel
    const [agentConfig, conversationContext, peerStatements, ibisNodes] = await Promise.all([
      getAgentConfig(supabase, 'peer_agent'),
      getRecentMessages(supabase, user_id, 10),
      getPeerStatements(supabase, user_id, 50),
      getIbisNodes(supabase, user_id, 20)
    ]);

    // Build contexts
    const ibisContext = buildIbisContext(ibisNodes);
    const relevantPeerPerspectives = await findRelevantPeerPerspectives(content, peerStatements, ANTHROPIC_API_KEY);
    const peerContext = buildPeerContext(relevantPeerPerspectives);

    // Build system prompt with enhancements
    const defaultSystemPrompt = `You are the Peer Agent, representing diverse perspectives and alternative viewpoints in democratic deliberation.

YOUR ROLE:
- Present thoughtful counterpoints and alternative perspectives
- Ask challenging but constructive questions
- Help explore the full spectrum of an issue
- Encourage critical thinking and deeper analysis
- Represent voices that might not otherwise be heard`;

    const systemPrompt = buildSystemPrompt(agentConfig, defaultSystemPrompt, input_type, session_state);

    // Build the complete prompt with peer-specific context
    const knowledgeContext = ibisContext + peerContext;
    const peerAgentPrompt = buildPeerAgentPrompt({
      systemPrompt,
      goals: agentConfig?.goals,
      responseStyle: agentConfig?.response_style,
      conversationContext,
      knowledgeContext,
      content,
      inputType: input_type,
      sessionState: session_state,
      agentType: 'peer_agent'
    });

    console.log('Calling Anthropic API for Peer Agent...');
    
    // Call Anthropic API and save response
    const agentResponse = await callAnthropicAPI(ANTHROPIC_API_KEY, peerAgentPrompt);
    await saveAgentMessage(supabase, agentResponse, user_id, 'peer_agent');

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: agentResponse 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Peer Agent error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});