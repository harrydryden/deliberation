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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { messageId, deliberationId, attempt } = await req.json();
    
    console.log(`🚀 BULK: Processing message ${messageId}, attempt ${attempt}`);

    // Get the message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('content, user_id, created_at')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      throw new Error(`Message not found: ${messageError?.message}`);
    }

    // Skip complex analysis - use bill_agent for all bulk processing
    const selectedAgent = 'bill_agent';
    console.log(`🤖 BULK: Using ${selectedAgent} for message ${messageId}`);

    // Get agent config
    const { data: agentConfig, error: agentError } = await supabase
      .from('agent_configurations')
      .select('*')
      .eq('agent_type', selectedAgent)
      .eq('deliberation_id', deliberationId)
      .eq('is_active', true)
      .single();

    if (agentError) {
      console.log(`⚠️ BULK: No local agent config, using default ${selectedAgent}`);
    }

    // Generate system prompt
    let systemPrompt = `You are the Bill Agent called "Bill", you are a reactive teaching agent that helps users/participants understand knowledge you have been endowed with.

YOUR ROLE:
- Synthesise knowledge uploaded to you
- Structure this knowledge 
- Answer questions based on the knowledge you have, which should primarily be information that has been uploaded into your knowledge base

INSTRUCTIONS:
1. Analyse the user's message for queries which relate to your role
2. Provide clear answers to these questions by sharing relevant facts and explainers

Communication style:
- Clear, professional, and authoritative
- Use precise language when discussing legal/policy matters
- Ask clarifying questions to understand participant needs
- Keep responses concise (2 paragraphs max but ideally shorter)

Focus areas:
- Legislative analysis and interpretation
- Policy impact assessment
- Evidence-based recommendations`;

    if (agentConfig?.prompt_overrides?.system_prompt) {
      systemPrompt = agentConfig.prompt_overrides.system_prompt;
    }

    // Get knowledge context (simplified - just get top 3 chunks)
    let knowledgeContext = '';
    try {
      const { data: knowledgeChunks } = await supabase
        .from('knowledge_chunks')
        .select('content')
        .eq('deliberation_id', deliberationId)
        .limit(3);
      
      if (knowledgeChunks?.length) {
        knowledgeContext = knowledgeChunks.map(chunk => chunk.content).join('\n\n');
        systemPrompt += `\n\nKNOWLEDGE CONTEXT:\n${knowledgeContext}`;
      }
    } catch (error) {
      console.log(`⚠️ BULK: Knowledge retrieval failed: ${error.message}`);
    }

    // Call OpenAI API (non-streaming for reliability)
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message.content }
        ],
        max_completion_tokens: 2000
      }),
    });

    if (!openAIResponse.ok) {
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const agentResponse = openAIData.choices[0]?.message?.content;
    
    if (!agentResponse) {
      throw new Error('No response from OpenAI');
    }

    console.log(`✅ BULK: Generated response for message ${messageId}: ${agentResponse.substring(0, 100)}...`);

    // Save agent response
    const { data: savedMessage, error: saveError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        user_id: agentConfig?.id || '561ceecc-b4c0-4cc1-b536-7521999b28c2', // Default Bill agent ID
        deliberation_id: deliberationId,
        message_type: selectedAgent,
        parent_message_id: messageId,
        bulk_import_status: 'agent_response_generated'
      })
      .select('id')
      .single();

    if (saveError) {
      throw new Error(`Failed to save response: ${saveError.message}`);
    }

    console.log(`🎉 BULK: Saved agent response ${savedMessage.id} for message ${messageId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      responseId: savedMessage.id,
      agentType: selectedAgent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`❌ BULK: Error processing message:`, error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});