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

// Enhanced system prompt builder
function buildSystemPrompt(agent: any): string {
  console.log(`🔧 Building system prompt for agent: ${agent.name}`);
  
  let systemPrompt = '';
  
  // Start with base prompt from overrides or construct default
  if (agent.prompt_overrides?.system_prompt) {
    systemPrompt = agent.prompt_overrides.system_prompt;
    console.log(`📝 Using override system prompt (${systemPrompt.length} chars)`);
  } else {
    // Construct comprehensive default prompt
    systemPrompt = `You are ${agent.name}, a ${agent.agent_type} agent.`;
    
    if (agent.description) {
      systemPrompt += `\n\nDescription: ${agent.description}`;
    }
    
    if (agent.goals && Array.isArray(agent.goals) && agent.goals.length > 0) {
      systemPrompt += `\n\nYour goals are:\n${agent.goals.map((goal: string, i: number) => `${i + 1}. ${goal}`).join('\n')}`;
    }
    
    if (agent.response_style) {
      systemPrompt += `\n\nResponse style: ${agent.response_style}`;
    }
    
    console.log(`🏗️ Built default system prompt (${systemPrompt.length} chars)`);
  }
  
  // Add facilitator configuration if present
  if (agent.facilitator_config && Object.keys(agent.facilitator_config).length > 0) {
    console.log(`🎯 Adding facilitator config`);
    if (agent.facilitator_config.guidelines) {
      systemPrompt += `\n\nFacilitator Guidelines: ${agent.facilitator_config.guidelines}`;
    }
    if (agent.facilitator_config.intervention_triggers) {
      systemPrompt += `\n\nIntervention Triggers: ${JSON.stringify(agent.facilitator_config.intervention_triggers)}`;
    }
  }
  
  return systemPrompt;
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
      
      // Analyze the message for sophisticated agent selection
      const openAIApiKey = getOpenAIKey();
      let messageAnalysis;
      
      try {
        messageAnalysis = await orchestrator.analyzeMessage(message.content, openAIApiKey);
        console.log(`🔍 [PHASE2] Message analysis complete:`, messageAnalysis);
      } catch (error) {
        console.warn(`⚠️ [PHASE2] Message analysis failed, using defaults:`, error);
        messageAnalysis = {
          intent: 'general',
          complexity: 0.5,
          topicRelevance: 0.5,
          requiresExpertise: false
        };
      }

      // Build conversation context
      const { data: recentMessages } = await userClient
        .from('messages')
        .select('message_type, created_at')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(10);

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

    // Phase 3: System Prompt Construction using orchestrator
    console.log(`📝 [PHASE3] Building system prompt with orchestrator`);
    const systemPrompt = await orchestrator.generateSystemPrompt(selectedAgent, selectedAgentType);
    console.log(`✅ [PHASE3] System prompt built (${systemPrompt.length} characters)`);

    // Phase 4: OpenAI API Call with enhanced error handling
    console.log(`🧠 [PHASE4] Calling OpenAI API`);
    const openAIApiKey = getOpenAIKey();
    
    if (!openAIApiKey) {
      throw new OrchestrationError(
        'OpenAI API key not configured',
        'OPENAI_KEY_MISSING'
      );
    }

    // Use orchestrator for optimal model selection
    const messageAnalysis = {
      intent: 'general',
      complexity: 0.5,
      topicRelevance: 0.5,
      requiresExpertise: false
    };
    const optimalModel = orchestrator.selectOptimalModel(messageAnalysis, selectedAgent);

    const openAIRequest = {
      model: optimalModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.content }
      ],
      max_completion_tokens: selectedAgent.max_response_characters || 1000,
      stream: false
    };

    console.log(`📤 [PHASE4] OpenAI request configured - model: ${openAIRequest.model}, max_tokens: ${openAIRequest.max_completion_tokens}`);

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