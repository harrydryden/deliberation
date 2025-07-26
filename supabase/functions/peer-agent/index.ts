import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to find relevant peer perspectives
async function findRelevantPeerPerspectives(query: string, peerStatements: any[], anthropicKey: string) {
  if (!peerStatements || peerStatements.length === 0) return [];
  
  try {
    // Use semantic similarity to find relevant perspectives
    const relevancePromises = peerStatements.slice(0, 10).map(async (statement) => {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 10,
          temperature: 0,
          messages: [{
            role: "user",
            content: `Rate the semantic relevance between these texts (0-1):

Query: "${query}"
Statement: "${statement.content}"

Respond with only a decimal number.`
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const relevance = parseFloat(data.content[0].text.trim());
        return { ...statement, relevance };
      }
      return { ...statement, relevance: 0 };
    });

    const scoredStatements = await Promise.all(relevancePromises);
    return scoredStatements
      .filter(s => s.relevance > 0.7)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 2);
  } catch (error) {
    console.error('Error finding relevant perspectives:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, content, user_id, input_type, session_state } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's recent messages for context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Search for relevant peer perspectives from other users' statements
    const { data: peerStatements } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('message_type', 'user')
      .neq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Get IBIS knowledge base for this user's context
    const { data: ibisNodes } = await supabase
      .from('ibis_nodes')
      .select(`
        title,
        description,
        node_type,
        created_at,
        messages!inner(user_id)
      `)
      .eq('messages.user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get default agent configuration
    const { data: agentConfig } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', 'peer_agent')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    const conversationContext = recentMessages?.reverse().map(m => 
      `[${m.message_type}]: ${m.content}`
    ).join('\n') || '';

    // Build IBIS knowledge context
    const ibisContext = ibisNodes?.length ? 
      `PREVIOUS STATEMENTS AND ARGUMENTS FROM IBIS KNOWLEDGE BASE:
${ibisNodes.map(node => `[${node.node_type.toUpperCase()}] ${node.title}: ${node.description}`).join('\n\n')}

` : '';

    // Build peer perspectives context
    const relevantPeerPerspectives = await findRelevantPeerPerspectives(content, peerStatements, ANTHROPIC_API_KEY);
    const peerContext = relevantPeerPerspectives.length > 0 ? 
      `RELEVANT PEER PERSPECTIVES:
${relevantPeerPerspectives.map((p, i) => `Perspective ${i + 1}: ${p.content}`).join('\n\n')}

` : '';

    // Build dynamic prompt from configuration and input type
    let systemPrompt = agentConfig?.system_prompt || `You are the Peer Agent, representing diverse perspectives and alternative viewpoints in democratic deliberation.

YOUR ROLE:
- Present thoughtful counterpoints and alternative perspectives
- Ask challenging but constructive questions
- Help explore the full spectrum of an issue
- Encourage critical thinking and deeper analysis
- Represent voices that might not otherwise be heard`;

    // Enhance system prompt based on input type
    if (input_type === 'QUESTION') {
      systemPrompt += `

QUESTION HANDLING:
- Provide community perspectives on the question
- Reference how others in the community have approached similar questions
- Offer alternative angles to consider
- Keep responses conversational and engaging`;
    } else if (input_type === 'STATEMENT') {
      const responseType = session_state?.statementCount % 2 === 1 ? 'supportive' : 'counter';
      systemPrompt += `

STATEMENT HANDLING:
- Provide a ${responseType} perspective to the user's statement
- ${responseType === 'supportive' ? 'Build upon their viewpoint with community support' : 'Present respectful alternative viewpoints from the community'}
- Reference relevant peer perspectives when available
- Maintain constructive dialogue`;
    }

    const goals = agentConfig?.goals?.length ? 
      `GOALS:\n${agentConfig.goals.map(goal => `- ${goal}`).join('\n')}\n\n` : '';

    const responseStyle = agentConfig?.response_style ? 
      `RESPONSE STYLE:\n${agentConfig.response_style}\n\n` : 
      `RESPONSE STYLE:\n- Thoughtful and challenging\n- Present alternative viewpoints respectfully\n- Ask probing questions\n- Keep responses concise (2-3 paragraphs max)\n\n`;

    let peerAgentPrompt;
    
    if (input_type === 'QUESTION') {
      peerAgentPrompt = `${systemPrompt}

${goals}${ibisContext}${peerContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

USER QUESTION: "${content}"

${responseStyle}Provide a community perspective on this question. ${peerContext ? 'Reference the relevant peer perspectives above when helpful. ' : ''}Frame your response as representing diverse viewpoints from the community.

Respond as the Peer Agent:`;
    } else if (input_type === 'STATEMENT') {
      const responseType = session_state?.statementCount % 2 === 1 ? 'supportive' : 'counter';
      peerAgentPrompt = `${systemPrompt}

${goals}${ibisContext}${peerContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

USER STATEMENT: "${content}"

${responseStyle}Provide a ${responseType} perspective from the community. ${peerContext ? 'Use the relevant peer perspectives above to inform your response. ' : ''} ${responseType === 'supportive' ? 'Show how others in the community share similar views.' : 'Present alternative viewpoints that others in the community might hold.'} Frame as: "Another participant shared a similar perspective:" or "Another participant offered this alternative view:"

Respond as the Peer Agent:`;
    } else {
      peerAgentPrompt = `${systemPrompt}

${goals}${ibisContext}${peerContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

NEW USER MESSAGE: "${content}"

${responseStyle}Use the IBIS knowledge base and peer perspectives to provide informed responses that build upon previous statements and arguments. Reference specific points when relevant and offer thoughtful counterpoints or alternative perspectives.

Respond as the Peer Agent:`;
    }


    console.log('Calling Anthropic API for Peer Agent...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: peerAgentPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const agentResponse = data.content[0].text;

    // Store the agent's response in the database
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        user_id: user_id,
        message_type: 'peer_agent'
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw insertError;
    }

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