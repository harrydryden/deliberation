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

// Import the sophisticated AgentOrchestrator
import { AgentOrchestrator } from '../shared/agent-orchestrator.ts';

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


// Enhanced error handling with specific error types
class OrchestrationError extends Error {
  constructor(message: string, public type: string, public details?: any) {
    super(message);
    this.name = 'OrchestrationError';
  }
}

// Main orchestration function with enhanced error handling and monitoring
async function processOrchestration(
  messageId: string,
  deliberationId: string,
  mode: string,
  serviceClient: any,
  userClient: any
): Promise<{ success: boolean; data?: any; error?: string; errorType?: string }> {
  const startTime = Date.now();
  console.log(`🚀 [ORCHESTRATION] Starting for message ${messageId} in mode ${mode}`);

  try {
    // Phase 1: Message Retrieval with enhanced validation
    console.log(`📥 [PHASE1] Retrieving message ${messageId}`);
    const { data: message, error: messageError } = await userClient
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError) {
      throw new OrchestrationError(
        `Message retrieval failed: ${messageError.message}`,
        'MESSAGE_RETRIEVAL_ERROR',
        { messageId, error: messageError }
      );
    }

    if (!message) {
      throw new OrchestrationError(
        'Message not found',
        'MESSAGE_NOT_FOUND',
        { messageId }
      );
    }

    console.log(`✅ [PHASE1] Retrieved message: "${message.content.substring(0, 100)}..." (user: ${message.user_id})`);

    // Phase 2: Agent Selection with enhanced logic
    console.log(`🤖 [PHASE2] Retrieving active agents for deliberation ${deliberationId}`);
    const { data: agents, error: agentsError } = await serviceClient
      .from('agent_configurations')
      .select('*')
      .eq('deliberation_id', deliberationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (agentsError) {
      throw new OrchestrationError(
        `Agent retrieval failed: ${agentsError.message}`,
        'AGENT_RETRIEVAL_ERROR',
        { deliberationId, error: agentsError }
      );
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      throw new OrchestrationError(
        'No active agents found for this deliberation',
        'NO_ACTIVE_AGENTS',
        { deliberationId }
      );
    }

    console.log(`✅ [PHASE2] Found ${agents.length} active agents`);

    // Initialize AgentOrchestrator for sophisticated selection
    const orchestrator = new AgentOrchestrator(serviceClient);
    let selectedAgent;
    let selectedAgentType: string;
    let messageAnalysis;

    // Analyze the message with optimized analysis (needed for both modes)
    const openAIApiKey = getOpenAIKey();
    try {
      messageAnalysis = await orchestrator.analyzeMessage(message.content, openAIApiKey, deliberationId);
      console.log(`🔍 [ANALYSIS] Optimized analysis complete:`, messageAnalysis);
    } catch (error) {
      console.warn(`⚠️ [ANALYSIS] Analysis failed, using enhanced defaults:`, error);
      messageAnalysis = orchestrator.generateIntelligentDefaults(message.content);
      console.log(`🧠 [FALLBACK] Using intelligent defaults:`, messageAnalysis);
    }

    // Build conversation context for both modes (needed for system prompt generation)
    const { data: recentMessages } = await userClient
      .from('messages')
      .select('message_type, created_at')
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Mode-aware agent selection
    if (mode === 'learn') {
      console.log(`🎯 [PHASE2] Learn mode detected - selecting Bill (policy_agent)`);
      selectedAgentType = 'bill_agent';
      
      // Get Bill's configuration
      const billConfig = await orchestrator.getAgentConfig('bill_agent', deliberationId);
      if (billConfig) {
        selectedAgent = billConfig;
        console.log(`✅ [PHASE2] Bill agent configured and selected`);
      } else {
        console.warn(`⚠️ [PHASE2] Bill agent not configured, falling back to available agents`);
        selectedAgent = agents.find(agent => agent.is_default) || agents[0];
        selectedAgentType = selectedAgent.agent_type;
      }
    } else {
      console.log(`🎯 [PHASE2] Chat mode - using orchestration algorithm`);

      const conversationContext = {
        messageCount: recentMessages?.length || 0,
        recentMessages: recentMessages || [],
        lastAgentType: recentMessages?.[0]?.message_type
      };

      // Use sophisticated agent selection
      selectedAgentType = await orchestrator.selectOptimalAgent(
        messageAnalysis,
        conversationContext,
        deliberationId
      );

      // Get the selected agent's configuration
      const agentConfig = await orchestrator.getAgentConfig(selectedAgentType, deliberationId);
      if (agentConfig) {
        selectedAgent = agentConfig;
        console.log(`✅ [PHASE2] Orchestrated selection: ${selectedAgent.name} (${selectedAgent.agent_type})`);
      } else {
        console.warn(`⚠️ [PHASE2] Selected agent ${selectedAgentType} not configured, falling back`);
        selectedAgent = agents.find(agent => agent.is_default) || agents[0];
        selectedAgentType = selectedAgent.agent_type;
      }
    }

    console.log(`🎯 [PHASE2] Final selection: ${selectedAgent.name} (${selectedAgentType}) - Mode: ${mode}`);
    console.log(`✅ [PHASE2] Orchestrated selection: ${selectedAgent.name} (${selectedAgentType})`);

    // Phase 3: System Prompt Construction using orchestrator
    console.log(`📝 [PHASE3] Building system prompt with orchestrator`);
    const systemPrompt = await orchestrator.generateSystemPrompt(
      selectedAgent, 
      selectedAgentType,
      {
        deliberationId,
        messageAnalysis,
        conversationLength: recentMessages?.length || 0
      }
    );
    console.log(`✅ [PHASE3] System prompt built (${systemPrompt.length} characters)`);

    // Phase 4: OpenAI API Call with enhanced error handling
    console.log(`🧠 [PHASE4] Calling OpenAI API`);
    
    if (!openAIApiKey) {
      throw new OrchestrationError(
        'OpenAI API key not configured',
        'OPENAI_KEY_MISSING'
      );
    }

    // Use orchestrator for optimal model selection with real analysis data
    const selectedModel = orchestrator.selectOptimalModel(messageAnalysis, selectedAgent);

    const openAIRequest = {
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.content }
      ],
      stream: false
    };

    // CRITICAL: Convert character limit to proper token count with larger budget
    const characterLimit = selectedAgent.max_response_characters || 2000;
    const tokenLimit = Math.floor(characterLimit / 2); // Less conservative 2:1 ratio for more response space
    
    // Add proper token limits based on model type
    if (selectedModel.startsWith('gpt-5') || selectedModel.startsWith('gpt-4.1') || selectedModel.startsWith('o3') || selectedModel.startsWith('o4')) {
      openAIRequest.max_completion_tokens = tokenLimit;
      // Note: Temperature not supported for newer models
    } else {
      openAIRequest.max_tokens = tokenLimit;
      openAIRequest.temperature = 0.7;
    }

    console.log(`📤 [PHASE4] OpenAI request configured - model: ${openAIRequest.model}, tokens: ${tokenLimit} (${characterLimit} chars), max_tokens: ${openAIRequest.max_tokens || openAIRequest.max_completion_tokens}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAIRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = { message: errorText };
      }
      
      throw new OrchestrationError(
        `OpenAI API error: ${response.status} - ${errorDetails.error?.message || errorText}`,
        'OPENAI_API_ERROR',
        { status: response.status, error: errorDetails }
      );
    }

    const data = await response.json();
    const fullResponse = Array.isArray(data.choices) && data.choices.length > 0 
      ? data.choices[0]?.message?.content || ''
      : '';

    if (!fullResponse) {
      throw new OrchestrationError(
        'No response generated from OpenAI',
        'OPENAI_EMPTY_RESPONSE',
        { response: data }
      );
    }

    console.log(`✅ [PHASE4] OpenAI response generated (${fullResponse.length} characters)`);

    // Phase 5: Save Agent Response with proper attribution
    console.log(`💾 [PHASE5] Saving agent response to database`);
    const messageData = {
      deliberation_id: deliberationId,
      user_id: message.user_id, // Maintain the same user_id for proper RLS
      content: fullResponse,
      message_type: selectedAgentType,
      agent_context: {
        agent_id: selectedAgent.id,
        agent_name: selectedAgent.name,
        agent_type: selectedAgent.agent_type,
        processing_mode: mode,
        processing_method: 'enhanced_orchestration',
        system_prompt_length: systemPrompt.length,
        response_length: fullResponse.length,
        processing_time_ms: Date.now() - startTime
      },
      parent_message_id: messageId
    };

    const { data: insertedMessage, error: insertError } = await userClient
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (insertError) {
      throw new OrchestrationError(
        `Database save error: ${insertError.message}`,
        'DATABASE_SAVE_ERROR',
        { error: insertError, messageData }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(`🎉 [SUCCESS] Orchestration completed in ${totalTime}ms`);
    
    return {
      success: true,
      data: {
        message: insertedMessage,
        agentType: selectedAgentType,
        agentName: selectedAgent.name,
        processingMode: mode,
        processingTimeMs: totalTime,
        systemPromptLength: systemPrompt.length,
        responseLength: fullResponse.length
      }
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    if (error instanceof OrchestrationError) {
      console.error(`❌ [${error.type}] ${error.message}`, error.details);
      return {
        success: false,
        error: error.message,
        errorType: error.type
      };
    } else {
      console.error('❌ [UNKNOWN_ERROR] Orchestration failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: 'UNKNOWN_ERROR'
      };
    }
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