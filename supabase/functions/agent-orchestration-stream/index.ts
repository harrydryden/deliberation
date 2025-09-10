import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// Import only the working shared utilities
import {
  corsHeaders,
  validateAndGetEnvironment,
  handleCORSPreflight,
  createErrorResponse,
  getOpenAIKey,
  parseAndValidateRequest,
  createStreamingResponse
} from '../shared/edge-function-utils.ts';

// Enhanced authentication-aware client creation
function createAuthenticatedClients(request: Request) {
  const { supabase: serviceClient } = validateAndGetEnvironment();
  
  // Extract user token for authenticated operations
  const authHeader = request.headers.get('authorization');
  let userClient = serviceClient; // fallback to service role
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const userToken = authHeader.substring(7);
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
      
      if (supabaseUrl && supabaseAnonKey) {
        // Create authenticated client with user's token
        userClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
          global: {
            headers: {
              authorization: authHeader
            }
          }
        });
        console.log('🔐 Using authenticated user client');
      }
    } catch (error) {
      console.warn('⚠️ Failed to create authenticated client, using service role:', error);
    }
  } else {
    console.warn('⚠️ No authorization header found, using service role');
  }
  
  return { serviceClient, userClient };
}

// Main orchestration function with enhanced authentication
async function processStreamingOrchestration(
  messageId: string,
  deliberationId: string,
  mode: string,
  serviceClient: any,
  userClient: any,
  sendData: (data: any) => void
): Promise<void> {
  console.log(`🤖 Processing orchestration for message ${messageId} in mode ${mode}`);

  try {
    // Get the message using user client for proper RLS
    const { data: message, error: messageError } = await userClient
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      throw new Error(`Message not found: ${messageError?.message || 'Unknown error'}`);
    }

    console.log(`📝 Retrieved message: "${message.content.substring(0, 100)}..."`);

    // Get active agents for this deliberation using service client
    const { data: agents, error: agentsError } = await serviceClient
      .from('agent_configurations')
      .select('*')
      .eq('deliberation_id', deliberationId)
      .eq('is_active', true);

    if (agentsError) {
      throw new Error(`Failed to get agents: ${agentsError.message}`);
    }

    console.log(`🤖 Found ${agents?.length || 0} active agents`);

    // Simple agent selection - pick the first active agent
    const selectedAgent = agents?.[0];
    if (!selectedAgent) {
      throw new Error('No active agents found for this deliberation');
    }

    console.log(`🎯 Selected agent: ${selectedAgent.name} (${selectedAgent.agent_type})`);

    // Generate response using OpenAI
    const openAIApiKey = getOpenAIKey();
    const systemPrompt = selectedAgent.prompt_overrides?.system_prompt || 
      `You are ${selectedAgent.name}, a ${selectedAgent.agent_type}. ${selectedAgent.description || ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        max_completion_tokens: 1000,
        stream: true
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          if (line.includes('[DONE]')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              sendData({ content, done: false });
            }
          } catch (e) {
            // Ignore parse errors for streaming
          }
        }
      }
    }

    // Save the agent response using user client for proper attribution
    const { error: insertError } = await userClient
      .from('messages')
      .insert({
        deliberation_id: deliberationId,
        user_id: message.user_id,
        content: fullResponse,
        message_type: selectedAgent.agent_type,
        agent_context: {
          agent_type: selectedAgent.agent_type,
          processing_mode: mode,
          processing_method: 'streaming_orchestration'
        },
        parent_message_id: messageId
      });

    if (insertError) {
      console.error('Failed to save agent response:', insertError);
      throw new Error(`Database save error: ${insertError.message}`);
    }

    sendData({ content: '', done: true });
    console.log(`✅ Orchestration completed successfully`);

  } catch (error) {
    console.error('❌ Orchestration error:', error);
    sendData({ error: error instanceof Error ? error.message : 'Unknown error', done: true });
  }
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('🚀 Agent orchestration stream starting...');

    // Parse and validate request with shared utility
    const { messageId, deliberationId, mode } = await parseAndValidateRequest(req, [
      'messageId', 
      'deliberationId'
    ]);

    console.log(`📋 Request: messageId=${messageId}, deliberationId=${deliberationId}, mode=${mode || 'chat'}`);

    // Create authenticated clients using enhanced method
    const { serviceClient, userClient } = createAuthenticatedClients(req);

    // Create streaming response with shared utility
    const { sendData, stream } = createStreamingResponse();
    
    const response = new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

    // Process orchestration in background
    processStreamingOrchestration(
      messageId,
      deliberationId,
      mode || 'chat',
      serviceClient,
      userClient,
      sendData
    ).then(() => {
      sendData({ content: '', done: true });
    }).catch((error) => {
      console.error('Orchestration failed:', error);
      sendData({ error: error.message, done: true });
    });

    return response;

  } catch (error: any) {
    console.error('❌ Request processing error:', error);
    return createErrorResponse(error, 500, 'agent-orchestration-stream');
  }
});