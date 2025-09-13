import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
// ============================================================================
// SOPHISTICATED AGENT RESPONSE GENERATION WITH SHARED FUNCTIONALITY INLINED
// ============================================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
// ============================================================================
// ENHANCED EDGE LOGGER
// ============================================================================
class EdgeLogger {
  static formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }
  static debug(message, data) {
    console.log(this.formatMessage('DEBUG', message, data));
  }
  static info(message, data) {
    console.log(this.formatMessage('INFO', message, data));
  }
  static warn(message, data) {
    console.log(this.formatMessage('WARN', message, data));
  }
  static error(message, data) {
    console.error(this.formatMessage('ERROR', message, data));
  }
}
// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================
class CircuitBreaker {
  supabase;
  static CIRCUIT_BREAKER_ID = 'agent_response_generation';
  static CIRCUIT_BREAKER_THRESHOLD = 3;
  static CIRCUIT_BREAKER_TIMEOUT = 60000;
  constructor(supabase){
    this.supabase = supabase;
  }
  async isOpen() {
    try {
      const { data, error } = await this.supabase.from('circuit_breaker_state').select('*').eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID).maybeSingle();
      if (error || !data) return false;
      const now = Date.now();
      const lastFailureTime = new Date(data.last_failure_time).getTime();
      if (data.failure_count >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
        const timeSinceLastFailure = now - lastFailureTime;
        if (timeSinceLastFailure < CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT) {
          EdgeLogger.warn(`Circuit breaker OPEN - ${Math.ceil((CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s remaining`);
          return true;
        } else {
          await this.reset();
          return false;
        }
      }
      return false;
    } catch (error) {
      EdgeLogger.warn('Circuit breaker check failed, assuming closed', error);
      return false;
    }
  }
  async recordFailure() {
    try {
      const now = new Date();
      const { data: currentState } = await this.supabase.from('circuit_breaker_state').select('failure_count').eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID).maybeSingle();
      const newFailureCount = (currentState?.failure_count || 0) + 1;
      await this.supabase.from('circuit_breaker_state').upsert({
        id: CircuitBreaker.CIRCUIT_BREAKER_ID,
        failure_count: newFailureCount,
        last_failure_time: now,
        is_open: newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
        updated_at: now
      }, {
        onConflict: 'id'
      });
      EdgeLogger.info(`Circuit breaker failure recorded: ${newFailureCount}/${CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`);
    } catch (error) {
      EdgeLogger.error('Failed to record circuit breaker failure', error);
    }
  }
  async reset() {
    try {
      await this.supabase.from('circuit_breaker_state').update({
        failure_count: 0,
        is_open: false,
        updated_at: new Date()
      }).eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID);
      EdgeLogger.info('Circuit breaker RESET');
    } catch (error) {
      EdgeLogger.error('Failed to reset circuit breaker', error);
    }
  }
}
// ============================================================================
// ENHANCED AGENT RESPONSE GENERATION SERVICE
// ============================================================================
class AgentResponseGenerationService {
  circuitBreaker;
  supabase;
  openaiApiKey;
  constructor(supabase, openaiApiKey){
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }
  async generateAgentResponse(orchestrationResult, messageId, deliberationId, mode = 'chat') {
    const startTime = Date.now();
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback response');
      return this.generateFallbackResponse(orchestrationResult, messageId, deliberationId);
    }
    try {
      const { selectedAgent, analysis, systemPrompt, conversationContext } = orchestrationResult;
      EdgeLogger.info('Starting agent response generation', {
        agent: selectedAgent.type,
        messageId,
        deliberationId,
        model: selectedAgent.model
      });
      // Fetch the original user message
      const { data: originalMessage, error: messageError } = await this.supabase.from('messages').select('content, user_id').eq('id', messageId).single();
      if (messageError || !originalMessage) {
        throw new Error(`Failed to fetch original message: ${messageError?.message}`);
      }
      // Prepare OpenAI messages array
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];
      // Add conversation context
      if (conversationContext && Array.isArray(conversationContext)) {
        conversationContext.forEach((msg)=>{
          messages.push({
            role: msg.message_type === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        });
      }
      // Add knowledge context for bill_agent and policy_agent
      let knowledgeContext = '';
      if (selectedAgent.type === 'bill_agent' || selectedAgent.type === 'policy_agent') {
        knowledgeContext = await this.fetchKnowledgeContext(originalMessage.content);
        if (knowledgeContext) {
          messages[0].content += `\n\nRelevant Context:\n${knowledgeContext}`;
        }
      }
      // Add the current user message
      messages.push({
        role: 'user',
        content: originalMessage.content
      });
      // Call OpenAI API
      EdgeLogger.debug('Calling OpenAI API', {
        model: selectedAgent.model,
        messageCount: messages.length,
        hasKnowledgeContext: !!knowledgeContext
      });
      const openaiParams = buildOpenAIParams(selectedAgent.model, messages, selectedAgent.type);

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(openaiParams),
      });
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        throw new Error(`OpenAI API error: ${openaiResponse.status} ${errorText}`);
      }
      const openaiData = await openaiResponse.json();
      const generatedContent = openaiData.choices[0]?.message?.content;
      if (!generatedContent) {
        throw new Error('No content generated by OpenAI');
      }
      EdgeLogger.info('OpenAI response generated successfully', {
        length: generatedContent.length,
        model: selectedAgent.model
      });
      // Insert agent response into messages table
      const { data: agentMessage, error: insertError } = await this.supabase.from('messages').insert({
        content: generatedContent,
        message_type: selectedAgent.type,
        deliberation_id: deliberationId,
        parent_message_id: messageId,
        user_id: null,
        agent_context: {
          orchestrationId: orchestrationResult.metadata?.requestId,
          model: selectedAgent.model,
          analysis: analysis,
          knowledgeUsed: !!knowledgeContext,
          processingTime: Date.now() - startTime
        }
      }).select().single();
      if (insertError) {
        throw new Error(`Failed to insert agent message: ${insertError.message}`);
      }
      EdgeLogger.info('Agent message saved to database', {
        messageId: agentMessage.id,
        type: selectedAgent.type,
        length: generatedContent.length
      });
      // Update agent_interactions for analytics
      try {
        await this.supabase.from('agent_interactions').insert({
          message_id: agentMessage.id,
          deliberation_id: deliberationId,
          agent_type: selectedAgent.type,
          input_context: {
            originalMessageId: messageId,
            analysis: analysis,
            systemPrompt: systemPrompt.substring(0, 500) + '...'
          },
          output_response: generatedContent,
          processing_time: Date.now() - startTime
        });
      } catch (analyticsError) {
        EdgeLogger.warn('Failed to update agent_interactions', analyticsError);
      // Non-critical error, don't fail the entire operation
      }
      // Reset circuit breaker on success
      await this.circuitBreaker.reset();
      const duration = Date.now() - startTime;
      EdgeLogger.info('Agent response generation completed successfully', {
        agent: selectedAgent.type,
        duration,
        responseLength: generatedContent.length
      });
      return {
        success: true,
        agentMessage: {
          id: agentMessage.id,
          content: generatedContent,
          message_type: selectedAgent.type,
          created_at: agentMessage.created_at
        },
        agent: {
          type: selectedAgent.type,
          name: selectedAgent.name,
          model: selectedAgent.model
        },
        metadata: {
          processingTimeMs: duration,
          knowledgeUsed: !!knowledgeContext,
          responseLength: generatedContent.length,
          timestamp: new Date().toISOString(),
          requestId: orchestrationResult.metadata?.requestId,
          version: '2.0.0',
          features: {
            circuitBreaker: true,
            enhancedLogging: true,
            knowledgeRetrieval: true,
            analytics: true
          }
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Agent response generation failed', {
        error: error.message,
        duration,
        messageId,
        deliberationId
      });
      await this.circuitBreaker.recordFailure();
      return this.generateErrorResponse(error.message, orchestrationResult, messageId, deliberationId);
    }
  }
  async fetchKnowledgeContext(query) {
    try {
      EdgeLogger.debug('Fetching knowledge context', {
        queryLength: query.length
      });
      const { data: knowledgeData, error: knowledgeError } = await this.supabase.functions.invoke('knowledge_query', {
        body: {
          query: query,
          maxResults: 5,
          threshold: 0.7
        }
      });
      if (knowledgeError || !knowledgeData?.results?.length) {
        EdgeLogger.debug('No knowledge context found');
        return '';
      }
      const knowledgeContext = knowledgeData.results.map((r)=>`Context: ${r.content}`).join('\n\n');
      EdgeLogger.debug(`Retrieved ${knowledgeData.results.length} knowledge chunks`);
      return knowledgeContext;
    } catch (error) {
      EdgeLogger.warn('Knowledge retrieval failed', error);
      return '';
    }
  }
  generateFallbackResponse(orchestrationResult, messageId, deliberationId) {
    EdgeLogger.info('Generating fallback response', {
      agent: orchestrationResult.selectedAgent?.type,
      messageId
    });
    const fallbackResponses = {
      bill_agent: "I'm currently unable to provide a detailed policy analysis. Please try again in a moment.",
      peer_agent: "I'm experiencing technical difficulties and cannot synthesize participant perspectives right now. Please try again shortly.",
      flow_agent: "I'm temporarily unable to facilitate this discussion effectively. Please try again in a moment."
    };
    const agentType = orchestrationResult.selectedAgent?.type || 'flow_agent';
    const fallbackContent = fallbackResponses[agentType] || "I'm temporarily unavailable. Please try again shortly.";
    return {
      success: false,
      error: 'Service temporarily unavailable',
      fallback: {
        agentMessage: {
          content: fallbackContent,
          message_type: agentType,
          created_at: new Date().toISOString()
        },
        agent: {
          type: agentType,
          name: orchestrationResult.selectedAgent?.name || 'Fallback Agent',
          model: orchestrationResult.selectedAgent?.model || 'gpt-4o-mini'
        },
        metadata: {
          processingTimeMs: 0,
          knowledgeUsed: false,
          responseLength: fallbackContent.length,
          timestamp: new Date().toISOString(),
          fallbackReason: 'Circuit breaker open'
        }
      }
    };
  }
  generateErrorResponse(errorMessage, orchestrationResult, messageId, deliberationId) {
    return {
      success: false,
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        timestamp: new Date().toISOString(),
        requestId: orchestrationResult.metadata?.requestId,
        version: '2.0.0',
        error: true
      }
    };
  }
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function handleCORSPreflight(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  return null;
}
function createErrorResponse(error, status = 500, context) {
  const errorId = crypto.randomUUID();
  EdgeLogger.error(`${context || 'Edge Function'} Error`, {
    errorId,
    error: error?.message
  });
  return new Response(JSON.stringify({
    error: error?.message || 'An unexpected error occurred',
    errorId,
    context,
    timestamp: new Date().toISOString()
  }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function createSuccessResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
async function parseAndValidateRequest(request, requiredFields = []) {
  const requestId = crypto.randomUUID().slice(0, 8);
  EdgeLogger.debug('Parsing request body', {
    requestId,
    requiredFields
  });
  try {
    const body = await request.json();
    for (const field of requiredFields){
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    EdgeLogger.debug('Request validation successful', {
      requestId
    });
    return body;
  } catch (error) {
    EdgeLogger.error('Request parsing failed', {
      requestId,
      error: error.message
    });
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}
function getOpenAIKey() {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return apiKey;
}
async function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey)
  };
}
function buildOpenAIParams(model: string, messages: any[], agentType: string) {
  const isNewModel = model.startsWith('gpt-5') || 
                    model.startsWith('gpt-4.1') || 
                    model.startsWith('o3') || 
                    model.startsWith('o4');

  const base: any = {
    model,
    messages
  };

  const maxTokens = agentType === 'bill_agent' ? 1000 : 800;

  if (isNewModel) {
    // Newer models
    base.max_completion_tokens = maxTokens;
    // Do NOT send temperature
  } else {
    // Legacy models (e.g., gpt-4o-mini)
    base.max_tokens = maxTokens;
    base.temperature = 0.7;
  }

  return base;
}
// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================
serve(async (req)=>{
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;
  try {
    EdgeLogger.info('Agent response generation function called', {
      method: req.method,
      url: req.url
    });
    const { 
      message: rawMessage, 
      messageId, 
      deliberationId,
      conversationContext = {},
      mode = 'chat'
    } = await parseAndValidateRequest(req, [
      'message',
      'messageId',
      'deliberationId'
    ]);

    let message = rawMessage;

    // If message is missing but messageId is provided, fetch the message content
    if ((!message || message.trim().length === 0) && messageId) {
      const { supabase } = await validateAndGetEnvironment();
      const { data: msg, error } = await supabase
        .from('messages')
        .select('content')
        .eq('id', messageId)
        .maybeSingle();
      
      if (error || !msg?.content) {
        return createErrorResponse(
          new Error('Could not resolve message by messageId'), 
          400, 
          'Request validation'
        );
      }
      message = msg.content;
    }

    if (!message || !deliberationId) {
      return createErrorResponse(
        new Error('Missing required fields: message and deliberationId'),
        400,
        'Request validation'
      );
    }

    const { supabase } = await validateAndGetEnvironment();
    const openaiApiKey = getOpenAIKey();
    EdgeLogger.info('Processing agent response generation request', {
      messageId,
      deliberationId,
      agentType: orchestrationResult.selectedAgent.type,
      mode
    });
    // Create agent response generation service
    const responseService = new AgentResponseGenerationService(supabase, openaiApiKey);
    // Generate agent response
    const result = await responseService.generateAgentResponse(orchestrationResult, messageId, deliberationId, mode);
    EdgeLogger.info('Agent response generation completed', {
      success: result.success,
      agentType: orchestrationResult.selectedAgent.type,
      responseLength: result.agentMessage?.content?.length || 0
    });
    return createSuccessResponse(result);
  } catch (error) {
    EdgeLogger.error('Agent response generation error', error);
    return createErrorResponse(error, 500, 'agent response generation');
  }
});
