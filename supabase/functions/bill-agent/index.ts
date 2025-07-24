import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, content, user_id } = await req.json();
    
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's recent messages for context (no deliberation needed for single-user chat)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, message_type, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get default agent configuration
    const { data: agentConfig } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', 'bill_agent')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    // Search for relevant knowledge
    let knowledgeContext = '';
    if (agentConfig?.id) {
      try {
        const { data: knowledgeResults } = await supabase.functions.invoke('search-knowledge', {
          body: {
            query: content,
            agentId: agentConfig.id,
            limit: 3
          }
        });

        if (knowledgeResults?.results && knowledgeResults.results.length > 0) {
          knowledgeContext = `\n\nRELEVANT KNOWLEDGE:\n${knowledgeResults.results.map((item: any, index: number) => 
            `[${index + 1}] ${item.title}: ${item.content.substring(0, 500)}...`
          ).join('\n\n')}\n\n`;
        }
      } catch (error) {
        console.log('Knowledge search failed, continuing without:', error);
      }
    }

    const context = recentMessages?.reverse().map(m => 
      `[${m.message_type}]: ${m.content}`
    ).join('\n') || '';

    // Build dynamic prompt from configuration
    const systemPrompt = agentConfig?.system_prompt || `You are the Bill Agent, a specialized AI facilitator for democratic deliberation using the IBIS (Issue-Based Information System) framework.

YOUR ROLE:
- Synthesize user input into clear IBIS Issues (core problems/questions)
- Identify and articulate different Positions (solutions/stances) 
- Extract Arguments (supporting/opposing evidence)
- Maintain a structured overview of the deliberation
- Help users explore and develop their ideas through thoughtful questions
- Use relevant knowledge from documents and sources to provide context and insights`;

    const goals = agentConfig?.goals?.length ? 
      `GOALS:\n${agentConfig.goals.map(goal => `- ${goal}`).join('\n')}\n\n` : '';

    const responseStyle = agentConfig?.response_style ? 
      `RESPONSE STYLE:\n${agentConfig.response_style}\n\n` : 
      `RESPONSE STYLE:\n- Professional yet conversational\n- Focus on the structural aspects of the argument\n- Encourage deeper thinking\n- Keep responses concise (2-3 paragraphs max)\n- Reference relevant knowledge when helpful\n\n`;

    const billAgentPrompt = `${systemPrompt}

${goals}CONVERSATION CONTEXT:
${context}
${knowledgeContext}
NEW USER MESSAGE: "${content}"

${responseStyle}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}Respond as the Bill Agent:`;

    console.log('Calling Anthropic API...');
    
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
            content: billAgentPrompt
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
        message_type: 'bill_agent'
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