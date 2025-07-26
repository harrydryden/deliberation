import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  corsHeaders, 
  createSupabaseClient, 
  getRecentMessages, 
  getAgentConfig, 
  searchKnowledge, 
  callAnthropicAPI, 
  saveAgentMessage,
  buildSystemPrompt,
  type AgentContext
} from '../shared/agent-utils.ts';
import { buildBillAgentPrompt } from '../shared/prompt-builders.ts';

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

    // Get agent configuration and context
    const [agentConfig, conversationContext] = await Promise.all([
      getAgentConfig(supabase, 'bill_agent'),
      getRecentMessages(supabase, user_id, 10)
    ]);

    // Search for relevant knowledge
    const knowledgeContext = await searchKnowledge(supabase, agentConfig?.id, content);

    // Build system prompt with enhancements
    const defaultSystemPrompt = `You are the Bill Agent, a specialized AI facilitator for democratic deliberation using the IBIS (Issue-Based Information System) framework.

YOUR ROLE:
- Synthesize user input into clear IBIS Issues (core problems/questions)
- Identify and articulate different Positions (solutions/stances) 
- Extract Arguments (supporting/opposing evidence)
- Maintain a structured overview of the deliberation
- Help users explore and develop their ideas through thoughtful questions
- Use relevant knowledge from documents and sources to provide context and insights`;

    const systemPrompt = buildSystemPrompt(agentConfig, defaultSystemPrompt, input_type, session_state);

    // Build the complete prompt
    const billAgentPrompt = buildBillAgentPrompt({
      systemPrompt,
      goals: agentConfig?.goals,
      responseStyle: agentConfig?.response_style,
      conversationContext,
      knowledgeContext,
      content,
      inputType: input_type,
      sessionState: session_state,
      agentType: 'bill_agent'
    });

    console.log('Calling Anthropic API...');
    
    // Call Anthropic API and save response
    const agentResponse = await callAnthropicAPI(ANTHROPIC_API_KEY, billAgentPrompt);
    await saveAgentMessage(supabase, agentResponse, user_id, 'bill_agent');

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
    console.error('Bill Agent error:', error);
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