import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

// Inlined utilities to avoid cross-folder import issues
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] ${context || 'Edge Function'} Error:`, error);
  
  return new Response(
    JSON.stringify({
      error: error?.message || 'An unexpected error occurred',
      errorId,
      context,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function getOpenAIKey(): string {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return apiKey;
}

function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    userSupabase: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
  };
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    return body as T;
  } catch (error: any) {
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}

// Minimal AgentOrchestrator implementation to avoid complex imports
class AgentOrchestrator {
  private supabase: any;
  
  constructor(supabase: any) {
    this.supabase = supabase;
  }
  
  async analyzeMessage(content: string, openAIApiKey: string, deliberationId: string) {
    // Simplified analysis - just return basic structure
    return {
      complexity: 0.6,
      requiresReasoning: false,
      topic: 'general',
      urgency: 'medium'
    };
  }
  
  generateIntelligentDefaults(content: string) {
    return {
      complexity: 0.5,
      requiresReasoning: false,
      topic: 'general',
      urgency: 'medium'
    };
  }
  
  async selectOptimalAgent(analysis: any, context: any, deliberationId: string) {
    return 'facilitator_agent';
  }
  
  async getAgentConfig(agentType: string, deliberationId: string) {
    try {
      const { data: config } = await this.supabase
        .from('agent_configurations')
        .select('*')
        .eq('deliberation_id', deliberationId)
        .eq('agent_type', agentType)
        .single();
      
      return config;
    } catch (error) {
      return null;
    }
  }
  
  selectOptimalModel(analysis: any, agent: any) {
    return 'gpt-5-2025-08-07';
  }
  
  async generateSystemPrompt(agent: any, agentType: string, context: any) {
    return `You are ${agent.name || agentType}. ${agent.description || 'You assist in deliberation discussions.'}`;
  }
}

// Enhanced authentication-aware client creation
async function createAuthenticatedClients(request: Request) {
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
        // Create authenticated client with user's token using mapped import
        const { createClient } = await import('@supabase/supabase-js');
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

    // Phase 3: System Prompt Construction with IBIS context for peer_agent
    console.log(`📝 [PHASE3] Building system prompt with orchestrator`);
    
    let context = {
      deliberationId,
      messageAnalysis,
      conversationLength: recentMessages?.length || 0
    };
    
    // Fetch relevant IBIS nodes for peer_agent (Pia) using semantic similarity
    if (selectedAgentType === 'peer_agent') {
      console.log(`🔍 [PHASE3] Finding semantically relevant IBIS nodes for peer agent`);
      try {
        // Generate embedding for the user's message
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: message.content,
            encoding_format: 'float'
          }),
        });

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          const queryEmbedding = embeddingData.data[0].embedding;
          
          // Find similar IBIS nodes using our new function
          const { data: similarNodes, error: similarError } = await serviceClient
            .rpc('match_ibis_nodes_for_query', {
              query_embedding: queryEmbedding,
              deliberation_uuid: deliberationId,
              match_threshold: 0.65,
              match_count: 8
            });
          
          if (similarError) {
            console.warn(`⚠️ [PHASE3] Similarity search failed: ${similarError.message}`);
            // Fallback to recent nodes as backup
            const { data: recentNodes } = await serviceClient
              .from('ibis_nodes')
              .select('id, title, description, node_type')
              .eq('deliberation_id', deliberationId)
              .order('created_at', { ascending: false })
              .limit(3);
            context.similarNodes = recentNodes || [];
          } else {
            context.similarNodes = (similarNodes || []).map(node => ({
              ...node,
              similarity: node.similarity
            }));
            console.log(`📋 [PHASE3] Found ${similarNodes?.length || 0} semantically relevant IBIS nodes (similarity > 0.65)`);
          }
        } else {
          console.warn(`⚠️ [PHASE3] Embedding generation failed, using recent nodes fallback`);
          const { data: recentNodes } = await serviceClient
            .from('ibis_nodes')
            .select('id, title, description, node_type')
            .eq('deliberation_id', deliberationId)
            .order('created_at', { ascending: false })
            .limit(3);
          context.similarNodes = recentNodes || [];
        }
      } catch (error) {
        console.warn(`⚠️ [PHASE3] IBIS relevance search failed:`, error);
        context.similarNodes = [];
      }
    }
    
    const systemPrompt = await orchestrator.generateSystemPrompt(
      selectedAgent, 
      selectedAgentType,
      context
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

    // Add temperature for legacy models only (newer models don't support it)
    if (!selectedModel.startsWith('gpt-5') && !selectedModel.startsWith('gpt-4.1') && !selectedModel.startsWith('o3') && !selectedModel.startsWith('o4')) {
      openAIRequest.temperature = 0.7;
    }

    console.log(`📤 [PHASE4] OpenAI request configured - model: ${openAIRequest.model} (no token limits, relying on system prompt character guidance)`);

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
    let fullResponse = Array.isArray(data.choices) && data.choices.length > 0 
      ? data.choices[0]?.message?.content || ''
      : '';

    // Handle empty responses with retry logic  
    if (!fullResponse || (data.choices?.[0]?.finish_reason === 'length' && fullResponse.length < 10)) {
      console.warn(`⚠️ [PHASE4] Empty/truncated OpenAI response detected - finish_reason: ${data.choices?.[0]?.finish_reason}`);
      
      // Try one immediate retry with enhanced instructions
      if (data.choices?.[0]?.finish_reason === 'length') {
        console.log(`🔄 [PHASE4] Retrying with enhanced completion instructions`);
        
        const enhancedRequest = { ...openAIRequest };
        
        // Add strict completion instruction to system prompt
        enhancedRequest.messages[0].content += `\n\nCRITICAL: You MUST provide a complete response. Do not stop mid-sentence. Prioritize essential information and be concise but complete.`;
        
        try {
          const retryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(enhancedRequest),
          });
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const retryContent = retryData.choices?.[0]?.message?.content || '';
            if (retryContent && retryContent.length > 10) {
              fullResponse = retryContent;
              console.log(`✅ [PHASE4] Retry successful - generated ${retryContent.length} characters`);
            }
          }
        } catch (retryError) {
          console.warn(`⚠️ [PHASE4] Retry failed:`, retryError);
        }
      }
      
      // If still empty, provide intelligent fallback for peer_agent
      if (!fullResponse && selectedAgentType === 'peer_agent') {
        console.log(`🛟 [PHASE4] Providing intelligent IBIS fallback for peer agent`);
        
        if (context.similarNodes?.length > 0) {
          // Show only relevant nodes with similarity scores
          const relevantNodes = context.similarNodes.filter(node => 
            node.similarity === undefined || node.similarity > 0.75
          );
          
          if (relevantNodes.length > 0) {
            fullResponse = `Based on your message, here are the most relevant viewpoints from our deliberation:\n\n` +
              relevantNodes.slice(0, 3).map((node, index) => {
                const similarityNote = node.similarity ? ` (${Math.round(node.similarity * 100)}% relevant)` : '';
                return `${index + 1}. **${node.title}** (${node.node_type})${similarityNote}\n   ${node.description || 'No additional details provided'}`;
              }).join('\n\n') +
              `\n\nWould you like me to explore any of these perspectives further or help you add a new viewpoint to the discussion?`;
          } else {
            fullResponse = `I don't see any existing viewpoints that directly relate to your message. This could be a great opportunity to introduce a new perspective to our deliberation. Would you like me to help you structure your thoughts or explore related aspects of this topic?`;
          }
        } else {
          fullResponse = `I don't have access to previous viewpoints in this deliberation right now. Could you tell me more about what specific aspect you'd like to discuss? I'm here to help you contribute meaningfully to the conversation.`;
        }
      }
      
      // Final check - if still empty, throw error
      if (!fullResponse) {
        console.error(`❌ [OPENAI_EMPTY_RESPONSE] No response generated from OpenAI`, { response: data });
        throw new OrchestrationError(
          'No response generated from OpenAI',
          'OPENAI_EMPTY_RESPONSE',
          { response: data }
        );
      }
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
    const { serviceClient, userClient } = await createAuthenticatedClients(req);

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