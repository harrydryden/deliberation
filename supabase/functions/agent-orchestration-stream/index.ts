import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// Import only the working shared utilities - removed streaming since we're using JSON
import {
  corsHeaders,
  validateAndGetEnvironment,
  handleCORSPreflight,
  createErrorResponse,
  createSuccessResponse,
  getOpenAIKey,
  parseAndValidateRequest
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

// Main orchestration function - now returns JSON instead of streaming
async function processOrchestration(
  messageId: string,
  deliberationId: string,
  mode: string,
  serviceClient: any,
  userClient: any
): Promise<{ success: boolean; data?: any; error?: string }> {
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

    console.log(`🤖 Found ${Array.isArray(agents) ? agents.length : 0} active agents`);

    // Simple agent selection - pick the first active agent
    const selectedAgent = Array.isArray(agents) && agents.length > 0 ? agents[0] : null;
    if (!selectedAgent) {
      throw new Error('No active agents found for this deliberation');
    }

    console.log(`🎯 Selected agent: ${selectedAgent.name} (${selectedAgent.agent_type})`);

    // Generate response using OpenAI - NON-STREAMING for JSON response
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
        stream: false // Changed to non-streaming
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const fullResponse = Array.isArray(data.choices) && data.choices.length > 0 
      ? data.choices[0]?.message?.content || ''
      : '';

    if (!fullResponse) {
      throw new Error('No response generated from OpenAI');
    }

    // Save the agent response using user client for proper attribution
    const { data: insertedMessage, error: insertError } = await userClient
      .from('messages')
      .insert({
        deliberation_id: deliberationId,
        user_id: message.user_id,
        content: fullResponse,
        message_type: selectedAgent.agent_type,
        agent_context: {
          agent_type: selectedAgent.agent_type,
          processing_mode: mode,
          processing_method: 'json_orchestration'
        },
        parent_message_id: messageId
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save agent response:', insertError);
      throw new Error(`Database save error: ${insertError.message}`);
    }

    console.log(`✅ Orchestration completed successfully`);
    
    return {
      success: true,
      data: {
        message: insertedMessage,
        agentType: selectedAgent.agent_type,
        processingMode: mode
      }
    };

  } catch (error) {
    console.error('❌ Orchestration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('🚀 Agent orchestration starting...');

    // Parse and validate request with shared utility
    const { messageId, deliberationId, mode } = await parseAndValidateRequest(req, [
      'messageId', 
      'deliberationId'
    ]);

    console.log(`📋 Request: messageId=${messageId}, deliberationId=${deliberationId}, mode=${mode || 'chat'}`);

    // Create authenticated clients using enhanced method
    const { serviceClient, userClient } = createAuthenticatedClients(req);

    // Process orchestration and wait for completion - JSON response pattern
    const result = await processOrchestration(
      messageId,
      deliberationId,
      mode || 'chat',
      serviceClient,
      userClient
    );

    // Return standard JSON response like all other working functions
    if (result.success) {
      return createSuccessResponse(result.data);
    } else {
      return createErrorResponse(new Error(result.error || 'Unknown error'), 500, 'agent-orchestration');
    }

  } catch (error: any) {
    console.error('❌ Request processing error:', error);
    return createErrorResponse(error, 500, 'agent-orchestration');
  }
});