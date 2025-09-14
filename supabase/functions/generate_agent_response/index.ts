import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// ============================================================================
// ENHANCED AGENT RESPONSE GENERATION WITH PARALLEL REQUESTS
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
  static debug(message: string, data?: any): void {
    console.log(this.formatMessage('DEBUG', message, data));
  }
  static info(message: string, data?: any): void {
    console.log(this.formatMessage('INFO', message, data));
  }
  static warn(message: string, data?: any): void {
    console.log(this.formatMessage('WARN', message, data));
  }
  static error(message: string, data?: any): void {
    console.error(this.formatMessage('ERROR', message, data));
  }
}

// ============================================================================
// ENHANCED CIRCUIT BREAKER WITH ADAPTIVE THRESHOLDS
// ============================================================================
class EnhancedCircuitBreaker {
  supabase;
  static CIRCUIT_BREAKER_ID = 'agent_response_generation_v2';
  static CIRCUIT_BREAKER_THRESHOLD = 3;
  static CIRCUIT_BREAKER_TIMEOUT = 45000; // Reduced from 60s for faster recovery
  
  constructor(supabase) {
    this.supabase = supabase;
  }

  async isOpen() {
    try {
      const { data, error } = await this.supabase.from('circuit_breaker_state')
        .select('*')
        .eq('id', EnhancedCircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();
      
      if (error || !data) return false;
      
      const now = Date.now();
      const lastFailureTime = new Date(data.last_failure_time).getTime();
      
      if (data.failure_count >= EnhancedCircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
        const timeSinceLastFailure = now - lastFailureTime;
        if (timeSinceLastFailure < EnhancedCircuitBreaker.CIRCUIT_BREAKER_TIMEOUT) {
          EdgeLogger.warn(`Enhanced circuit breaker OPEN - ${Math.ceil((EnhancedCircuitBreaker.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s remaining`);
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
      const { data: currentState } = await this.supabase.from('circuit_breaker_state')
        .select('failure_count')
        .eq('id', EnhancedCircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();
      
      const newFailureCount = (currentState?.failure_count || 0) + 1;
      
      await this.supabase.from('circuit_breaker_state')
        .upsert({
          id: EnhancedCircuitBreaker.CIRCUIT_BREAKER_ID,
          failure_count: newFailureCount,
          last_failure_time: now,
          is_open: newFailureCount >= EnhancedCircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
          updated_at: now
        }, { onConflict: 'id' });
      
      EdgeLogger.info(`Enhanced circuit breaker failure recorded: ${newFailureCount}/${EnhancedCircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`);
    } catch (error) {
      EdgeLogger.error('Failed to record circuit breaker failure', error);
    }
  }

  async reset() {
    try {
      await this.supabase.from('circuit_breaker_state')
        .update({
          failure_count: 0,
          is_open: false,
          updated_at: new Date()
        })
        .eq('id', EnhancedCircuitBreaker.CIRCUIT_BREAKER_ID);
      
      EdgeLogger.info('Enhanced circuit breaker RESET');
    } catch (error) {
      EdgeLogger.error('Failed to reset circuit breaker', error);
    }
  }
}

// ============================================================================
// ENHANCED AGENT RESPONSE GENERATION SERVICE WITH PARALLEL REQUESTS
// ============================================================================
class EnhancedAgentResponseService {
  circuitBreaker;
  supabase;
  openaiApiKey;
  promptService;
  
  constructor(supabase, openaiApiKey) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new EnhancedCircuitBreaker(supabase);
    this.promptService = new PromptTemplateService(supabase);
  }

  async generateAgentResponse(orchestrationResult, messageId, deliberationId, mode = 'chat', config = {}) {
    const startTime = Date.now();
    const requestId = config.requestId || `req_${Date.now()}`;
    
    EdgeLogger.info('Starting enhanced agent response generation', {
      requestId,
      agent: orchestrationResult.selectedAgent?.type,
      agentName: orchestrationResult.selectedAgent?.name,
      messageId,
      deliberationId,
      enhanced: config.enhanced || false,
      enableParallel: config.enableParallel || false
    });

    // Enhanced circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using enhanced fallback response');
      return this.generateEnhancedFallbackResponse(orchestrationResult, messageId, deliberationId);
    }

    try {
      const { selectedAgent, analysis, systemPrompt, conversationContext } = orchestrationResult;

      // Fetch original user message
      const { data: originalMessage, error: messageError } = await this.supabase.from('messages')
        .select('content, user_id')
        .eq('id', messageId)
        .single();
      
      if (messageError || !originalMessage) {
        throw new Error(`Failed to fetch original message: ${messageError?.message}`);
      }

      // Prepare messages array with enhanced context processing
      const messages = [{ role: 'system', content: systemPrompt }];

      // Enhanced conversation context processing
      if (conversationContext && Array.isArray(conversationContext)) {
        const maxContextMessages = config.enhanced ? 15 : 10;
        const contextToProcess = conversationContext.slice(-maxContextMessages);
        const processedContext = this.processConversationContext(contextToProcess, selectedAgent.type);
        
        processedContext.forEach((msg) => {
          messages.push({
            role: msg.message_type === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        });

        EdgeLogger.debug('Enhanced context processing', {
          originalCount: conversationContext.length,
          processedCount: processedContext.length,
          maxAllowed: maxContextMessages
        });
      }

      // Enhanced knowledge context integration
      let knowledgeContext = '';
      if (selectedAgent.type === 'bill_agent' || selectedAgent.type === 'policy_agent') {
        const agentId = orchestrationResult?.selectedAgent?.id;
        knowledgeContext = await this.fetchKnowledgeContext(originalMessage.content, agentId);
        
        if (knowledgeContext && typeof knowledgeContext === 'string') {
          messages[0].content += `\n\nRelevant Context:\n${knowledgeContext}`;
        }
      }

      // Add current user message
      messages.push({ role: 'user', content: originalMessage.content });

      // ENHANCED: Parallel request handling or sequential fallback
      let generatedContent = '';
      let modelUsed = selectedAgent.model;
      const enableParallel = config.enableParallel && !selectedAgent.model.startsWith('o3') && !selectedAgent.model.startsWith('o4');
      
      if (enableParallel) {
        EdgeLogger.info('Attempting enhanced parallel requests');
        const parallelResult = await this.tryEnhancedParallelRequests(
          selectedAgent.model, 
          messages, 
          selectedAgent, 
          config
        );
        
        if (parallelResult.success) {
          generatedContent = parallelResult.content;
          modelUsed = parallelResult.modelUsed;
          EdgeLogger.info('Enhanced parallel request succeeded', { 
            modelUsed,
            contentLength: generatedContent.length,
            strategy: 'parallel'
          });
        }
      }

      // Enhanced sequential fallback if parallel failed or not enabled
      if (!generatedContent) {
        EdgeLogger.info('Using enhanced sequential model fallback');
        const sequentialResult = await this.tryEnhancedSequentialRequests(
          selectedAgent.model,
          messages,
          selectedAgent,
          config
        );
        
        if (sequentialResult.success) {
          generatedContent = sequentialResult.content;
          modelUsed = sequentialResult.modelUsed;
        }
      }

      if (!generatedContent) {
        throw new Error('All enhanced request strategies failed to generate content');
      }

      // Enhanced response processing and database insertion
      EdgeLogger.info('Enhanced OpenAI response generated successfully', {
        length: generatedContent.length,
        model: modelUsed,
        agentType: selectedAgent.type,
        hasKnowledgeContext: !!knowledgeContext,
        messageCount: messages.length,
        processingTime: Date.now() - startTime,
        enhanced: true
      });

      // Enhanced message insertion with performance metadata
      const { data: agentMessage, error: insertError } = await this.supabase.from('messages')
        .insert({
          content: generatedContent,
          message_type: selectedAgent.type,
          deliberation_id: deliberationId,
          parent_message_id: messageId,
          user_id: originalMessage.user_id,
          agent_context: {
            agent_id: orchestrationResult?.selectedAgent?.id || selectedAgent.id,
            agent_name: orchestrationResult?.selectedAgent?.name || selectedAgent.name,
            agent_type: selectedAgent.type,
            processing_mode: mode,
            response_length: generatedContent.length,
            processing_method: 'enhanced_parallel_v2',
            processing_time_ms: Date.now() - startTime,
            model_used: modelUsed,
            parallel_enabled: enableParallel,
            enhanced: true,
            request_id: requestId,
            analysis: analysis,
            knowledge_used: !!knowledgeContext,
            performance: {
              totalTime: Date.now() - startTime,
              modelUsed,
              strategy: enableParallel ? 'parallel' : 'sequential'
            }
          }
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to insert enhanced agent message: ${insertError.message}`);
      }

      // Enhanced analytics tracking
      try {
        await this.supabase.from('agent_interactions')
          .insert({
            message_id: agentMessage.id,
            deliberation_id: deliberationId,
            agent_type: selectedAgent.type,
            input_context: {
              originalMessageId: messageId,
              analysis,
              enhancedFeatures: {
                parallelRequests: enableParallel,
                enhancedContext: config.enhanced,
                knowledgeIntegration: !!knowledgeContext
              }
            },
            output_response: generatedContent,
            processing_time: Date.now() - startTime,
            performance_metadata: {
              modelUsed,
              requestStrategy: enableParallel ? 'parallel' : 'sequential',
              enhanced: true
            }
          });
      } catch (analyticsError) {
        EdgeLogger.warn('Enhanced analytics logging failed', analyticsError);
      }

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      const duration = Date.now() - startTime;
      EdgeLogger.info('Enhanced agent response generation completed successfully', {
        agent: selectedAgent.type,
        agentName: selectedAgent.name,
        duration,
        responseLength: generatedContent.length,
        messageId: agentMessage.id,
        modelUsed,
        enhanced: true,
        parallelEnabled: enableParallel
      });

      return {
        success: true,
        messageId: agentMessage.id,
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
        performance: {
          totalTime: duration,
          modelUsed,
          strategy: enableParallel ? 'parallel' : 'sequential',
          enhanced: true
        },
        metadata: {
          processingTimeMs: duration,
          knowledgeUsed: !!knowledgeContext,
          responseLength: generatedContent.length,
          timestamp: new Date().toISOString(),
          requestId,
          version: '2.1.0-enhanced',
          features: {
            parallelRequests: enableParallel,
            enhancedCircuitBreaker: true,
            smartContextProcessing: true,
            performanceOptimization: true
          }
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Enhanced agent response generation failed', {
        error: error.message,
        duration,
        messageId,
        deliberationId,
        requestId
      });
      
      await this.circuitBreaker.recordFailure();
      return this.generateEnhancedErrorResponse(error.message, orchestrationResult, messageId, deliberationId);
    }
  }

  // ENHANCED: Parallel request handling with smart model selection
  async tryEnhancedParallelRequests(primaryModel, messages, selectedAgent, config = {}) {
    const modelsToTry = this.getEnhancedModelFallbackChain(primaryModel);
    const maxParallelRequests = Math.min(3, modelsToTry.length);
    const parallelModels = modelsToTry.slice(0, maxParallelRequests);
    
    EdgeLogger.info('Starting enhanced parallel requests', {
      primaryModel,
      parallelModels,
      agentType: selectedAgent.type,
      messageCount: messages.length
    });

    const requestPromises = parallelModels.map(async (model, index) => {
      try {
        // Standard context optimization for all models
        let messagesToUse = messages;

        const openaiParams = this.buildEnhancedOpenAIParams(model, messagesToUse, selectedAgent.type, {
          priority: index === 0 ? 'high' : 'normal',
          enhanced: config.enhanced
        });

        // Dynamic timeout based on model performance
        const timeoutMs = this.getOptimalTimeout(model, config);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const { endpoint, isResponsesAPI } = this.getEnhancedAPIEndpoint(model);
        
        EdgeLogger.debug(`Enhanced parallel request ${index + 1}/${maxParallelRequests}`, {
          model,
          timeout: timeoutMs,
          apiType: isResponsesAPI ? 'responses' : 'chat',
          messageCount: messagesToUse.length
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(openaiParams),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content?.trim();

        if (content) {
          EdgeLogger.info(`Enhanced parallel request succeeded: ${model}`, {
            contentLength: content.length,
            responseTime: Date.now() - Date.parse(new Date().toISOString()),
            position: index + 1
          });
          return { model, content, success: true, index };
        }

        return { model, content: null, success: false, index };
      } catch (error) {
        EdgeLogger.warn(`Enhanced parallel request failed: ${model}`, { 
          error: error.message,
          index 
        });
        return { model, content: null, success: false, error: error.message, index };
      }
    });

    try {
      // Enhanced race logic - return first successful response
      const results = await Promise.allSettled(requestPromises);
      
      // Find first successful result
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success && result.value.content) {
          EdgeLogger.info('Enhanced parallel request winner', {
            model: result.value.model,
            contentLength: result.value.content.length,
            position: result.value.index + 1
          });
          return {
            success: true,
            content: result.value.content,
            modelUsed: result.value.model
          };
        }
      }

      EdgeLogger.info('All enhanced parallel requests failed, will try sequential');
      return { success: false };
    } catch (error) {
      EdgeLogger.warn('Enhanced parallel request coordination failed', { error: error.message });
      return { success: false };
    }
  }

  // ENHANCED: Sequential request handling with smarter fallbacks
  async tryEnhancedSequentialRequests(primaryModel, messages, selectedAgent, config = {}) {
    const modelsToTry = this.getEnhancedModelFallbackChain(primaryModel);
    
    EdgeLogger.info('Enhanced sequential requests starting', {
      primaryModel,
      fallbackChain: modelsToTry,
      agentType: selectedAgent.type
    });

    for (const [index, model] of modelsToTry.entries()) {
      try {
        // Progressive context reduction for fallback models
        let messagesToUse = messages;
        const contextReductionFactor = index === 0 ? 1.0 : Math.max(0.5, 1.0 - (index * 0.2));
        
        if (contextReductionFactor < 1.0) {
          messagesToUse = this.reduceMessageContextSmartly(messages, contextReductionFactor);
          EdgeLogger.debug(`Context reduced for fallback model ${model}`, {
            originalMessages: messages.length,
            reducedMessages: messagesToUse.length,
            reductionFactor: contextReductionFactor
          });
        }

        const openaiParams = this.buildEnhancedOpenAIParams(model, messagesToUse, selectedAgent.type, {
          priority: index === 0 ? 'high' : 'normal',
          enhanced: config.enhanced,
          fallbackAttempt: index + 1
        });

        const timeoutMs = this.getOptimalTimeout(model, config, index);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const { endpoint, isResponsesAPI } = this.getEnhancedAPIEndpoint(model);

        EdgeLogger.info(`Enhanced sequential attempt ${index + 1}/${modelsToTry.length}: ${model}`, {
          timeout: timeoutMs,
          apiType: isResponsesAPI ? 'responses' : 'chat',
          messageCount: messagesToUse.length,
          isPrimaryModel: index === 0
        });

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(openaiParams),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          const content = result.choices?.[0]?.message?.content?.trim();

          if (content) {
            EdgeLogger.info(`Enhanced sequential request succeeded: ${model}`, {
              contentLength: content.length,
              attemptNumber: index + 1,
              strategy: 'sequential'
            });
            return { success: true, content, modelUsed: model };
          } else {
            EdgeLogger.warn(`Model ${model} returned empty content, trying next model`);
            
            // Single retry with minimal context for primary model
            if (index === 0 && messagesToUse.length > 2) {
              EdgeLogger.info(`${model} retry with minimal context`);
              const minimalMessages = [messagesToUse[0], messagesToUse[messagesToUse.length - 1]];
              const minimalParams = this.buildEnhancedOpenAIParams(model, minimalMessages, selectedAgent.type, {
                maxTokens: 300,
                enhanced: false
              });
              
              const retryController = new AbortController();
              const retryTimeoutId = setTimeout(() => retryController.abort(), 8000);
              
              try {
                const retryResponse = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(minimalParams),
                  signal: retryController.signal,
                });
                
                clearTimeout(retryTimeoutId);
                
                if (retryResponse.ok) {
                  const retryResult = await retryResponse.json();
                  const retryContent = isResponsesAPI ? 
                    retryResult.output_text?.trim() :
                    retryResult.choices?.[0]?.message?.content?.trim();
                  
                  if (retryContent) {
                    EdgeLogger.info(`${model} minimal context retry succeeded`);
                    return { success: true, content: retryContent, modelUsed: model };
                  }
                }
              } catch (retryError) {
                clearTimeout(retryTimeoutId);
                EdgeLogger.warn(`${model} retry failed: ${retryError.message}`);
              }
            }
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            EdgeLogger.warn(`Model ${model} timed out after ${timeoutMs}ms`);
          } else {
            throw fetchError;
          }
        }
      } catch (error) {
        EdgeLogger.warn(`Enhanced sequential model ${model} failed: ${error.message}`);
        if (index === modelsToTry.length - 1) {
          throw error;
        }
      }
    }

    return { success: false };
  }

  // ENHANCED: Simplified model fallback chain using gpt-4o-mini
  getEnhancedModelFallbackChain(primaryModel) {
    // Standardized fallback: gpt-4o-mini → gpt-4o-mini (stable model)
    return ['gpt-4o-mini'];
  }

  // ENHANCED: Simplified API endpoint routing
  getEnhancedAPIEndpoint(model) {
    // Use Chat Completions API for all models
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      isResponsesAPI: false
    };
  }

  // ENHANCED: Simplified parameter building
  buildEnhancedOpenAIParams(model, messages, agentType, options = {}) {
    const baseParams = {
      model,
      messages,
      stream: false,
    };

    // Calculate optimal token count
    const maxTokens = this.calculateOptimalTokens(model, agentType, options);
    baseParams.max_tokens = maxTokens;

    // Add temperature for models that support it
    if (model === 'gpt-4o-mini') {
      baseParams.temperature = this.calculateOptimalTemperature(agentType, options);
    }
    
    return baseParams;
  }

  calculateOptimalTokens(model, agentType, options = {}) {
    let baseTokens = 800;
    
    if (model === 'gpt-4o-mini') {
      baseTokens = agentType === 'facilitator' ? 700 : 1000;
    } else if (model.startsWith('o3') || model.startsWith('o4')) {
      baseTokens = 800;
    }
    
    // Adjust for fallback attempts
    if (options.fallbackAttempt && options.fallbackAttempt > 1) {
      baseTokens = Math.floor(baseTokens * Math.max(0.6, 1.0 - (options.fallbackAttempt - 1) * 0.15));
    }
    
    return baseTokens;
  }

  calculateOptimalTemperature(agentType, options = {}) {
    if (agentType === 'facilitator') return 0.3;
    if (options.enhanced) return 0.75;
    return 0.7;
  }

  getOptimalTimeout(model, config = {}, attemptIndex = 0) {
    let baseTimeout = 25000;
    
    if (model === 'gpt-4o-mini') {
      baseTimeout = 15000;
    } else if (model.startsWith('o3') || model.startsWith('o4')) {
      baseTimeout = 30000;
    }
    
    // Reduce timeout for fallback attempts to fail fast
    if (attemptIndex > 0) {
      baseTimeout = Math.max(8000, baseTimeout - (attemptIndex * 3000));
    }
    
    return Math.min(baseTimeout, config.timeout || 45000);
  }

  // ENHANCED: Smart context reduction preserving important information
  reduceMessageContextSmartly(messages, reductionFactor = 0.7) {
    if (messages.length <= 2) return messages;
    
    const systemMessage = messages[0];
    const userMessage = messages[messages.length - 1];
    const contextMessages = messages.slice(1, -1);
    
    if (contextMessages.length === 0) return messages;
    
    const keepCount = Math.max(1, Math.floor(contextMessages.length * reductionFactor));
    
    // Enhanced context preservation strategy
    let keptContext = [];
    
    if (keepCount >= contextMessages.length) {
      keptContext = contextMessages;
    } else {
      // Keep most recent messages (they're usually most relevant)
      const recentMessages = contextMessages.slice(-Math.ceil(keepCount * 0.7));
      
      // Keep some earlier messages for continuity if we have space
      const remainingSlots = keepCount - recentMessages.length;
      if (remainingSlots > 0 && contextMessages.length > recentMessages.length) {
        const earlierMessages = contextMessages.slice(0, remainingSlots);
        keptContext = [...earlierMessages, ...recentMessages];
      } else {
        keptContext = recentMessages;
      }
    }
    
    return [systemMessage, ...keptContext, userMessage];
  }

  // Enhanced knowledge context fetching
  async fetchKnowledgeContext(query, agentId) {
    try {
      EdgeLogger.debug('Fetching enhanced knowledge context', {
        queryLength: query.length,
        hasAgentId: !!agentId
      });

      const knowledgeResponse = await this.supabase.functions.invoke('knowledge_query', {
        body: {
          query: query,
          agentId,
          maxResults: 5,
          threshold: 0.25,
          generateResponse: false,
          enhanced: true
        }
      });

      if (knowledgeResponse.error) {
        EdgeLogger.warn('Enhanced knowledge query failed', { error: knowledgeResponse.error });
        return '';
      }

      const knowledgeData = knowledgeResponse.data;
      let results = [];
      
      if (knowledgeData?.results && Array.isArray(knowledgeData.results)) {
        results = knowledgeData.results;
      } else if (Array.isArray(knowledgeData)) {
        results = knowledgeData;
      }

      if (!results.length) {
        EdgeLogger.debug('No enhanced knowledge context found');
        return '';
      }

      const knowledgeContext = results.map((r, idx) => 
        `[${idx + 1}] ${r.title || 'Document'}: ${r.content || r.excerpt || ''}`
      ).join('\n\n');
      
      EdgeLogger.debug(`Enhanced knowledge retrieval: ${results.length} chunks`);
      return knowledgeContext;
    } catch (error) {
      EdgeLogger.warn('Enhanced knowledge retrieval failed', error);
      return '';
    }
  }

  // Enhanced conversation context processing
  processConversationContext(conversationContext, agentType) {
    if (!Array.isArray(conversationContext) || conversationContext.length === 0) {
      return [];
    }

    // Enhanced filtering based on agent type and message relevance
    return conversationContext.filter(msg => {
      if (msg.message_type === 'user') return true;
      
      // Keep messages from the same agent type
      if (msg.message_type === agentType) return true;
      
      // Keep facilitator messages for context
      if (msg.message_type === 'facilitator') return true;
      
      return false;
    }).map(msg => ({
      ...msg,
      content: msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content
    }));
  }

  // Enhanced fallback response generation
  async generateEnhancedFallbackResponse(orchestrationResult, messageId, deliberationId) {
    const fallbackContent = `I apologize, but I'm experiencing technical difficulties right now. Our systems are temporarily overloaded, but I'll be back online shortly. Please try your question again in a moment.

In the meantime, you can:
• Rephrase your question more specifically
• Break complex questions into smaller parts
• Try again in a few moments when system load decreases

Thank you for your patience as we work to maintain service quality.`;

    try {
      const { data: originalMessage } = await this.supabase.from('messages')
        .select('user_id')
        .eq('id', messageId)
        .single();

      const { data: agentMessage } = await this.supabase.from('messages')
        .insert({
          content: fallbackContent,
          message_type: 'system',
          deliberation_id: deliberationId,
          parent_message_id: messageId,
          user_id: originalMessage?.user_id || null,
          agent_context: {
            processing_method: 'enhanced_fallback',
            circuit_breaker_triggered: true,
            timestamp: new Date().toISOString()
          }
        })
        .select()
        .single();

      return {
        success: true,
        messageId: agentMessage.id,
        fallback: true,
        enhanced: true
      };
    } catch (error) {
      EdgeLogger.error('Enhanced fallback response failed', error);
      return {
        success: false,
        error: 'System temporarily unavailable',
        fallback: true
      };
    }
  }

  // Enhanced error response generation
  async generateEnhancedErrorResponse(errorMessage, orchestrationResult, messageId, deliberationId) {
    EdgeLogger.error('Generating enhanced error response', { errorMessage });
    
    return {
      success: false,
      error: errorMessage,
      enhanced: true,
      metadata: {
        timestamp: new Date().toISOString(),
        errorType: 'generation_failure',
        version: '2.1.0-enhanced'
      }
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function handleCORSPreflight(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error, status = 500, context = 'Unknown') {
  EdgeLogger.error(`Error in ${context}`, { error: error.message, status });
  return new Response(JSON.stringify({ 
    success: false, 
    error: error.message,
    context,
    timestamp: new Date().toISOString(),
    enhanced: true
  }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function createSuccessResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function parseAndValidateRequest(request, requiredFields = []) {
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!body[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    return body;
  } catch (error) {
    throw new Error(`Request parsing failed: ${error.message}`);
  }
}

function getOpenAIKey() {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) {
    throw new Error('OpenAI API key not configured');
  }
  return key;
}

async function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  return { supabase };
}

// ============================================================================
// MAIN ENHANCED EDGE FUNCTION
// ============================================================================
serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('Enhanced agent response generation function called', {
      method: req.method,
      url: req.url,
      enhanced: true
    });

    const { 
      message: rawMessage, 
      messageId, 
      deliberationId,
      mode = 'chat',
      orchestrationResult,
      enhanced = false,
      config = {}
    } = await parseAndValidateRequest(req, ['messageId', 'deliberationId']);

    let message = rawMessage;

    // Fetch message content if not provided
    if ((!message || message.trim().length === 0) && messageId) {
      const { supabase } = await validateAndGetEnvironment();
      const { data: msg, error } = await supabase
        .from('messages')
        .select('content')
        .eq('id', messageId)
        .maybeSingle();
      
      if (error || !msg?.content) {
        return createErrorResponse(
          new Error('Could not resolve message content'), 
          400, 
          'Message resolution'
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

    // Validate orchestrationResult or fetch it
    let validatedOrchestrationResult = orchestrationResult;
    if (!orchestrationResult || !orchestrationResult.selectedAgent || !orchestrationResult.systemPrompt) {
      EdgeLogger.warn('Invalid orchestrationResult, calling orchestration service');

      try {
        const orchestrationResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agent_orchestration_stream`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            messageId,
            deliberationId,
            mode,
            enhanced
          })
        });

        if (!orchestrationResponse.ok) {
          throw new Error(`Orchestration service failed: ${orchestrationResponse.status}`);
        }

        const orchestrationData = await orchestrationResponse.json();
        if (!orchestrationData.success) {
          throw new Error(`Orchestration failed: ${orchestrationData.error || 'Unknown error'}`);
        }

        validatedOrchestrationResult = orchestrationData;
        EdgeLogger.info('Enhanced orchestration result obtained from fallback service');
      } catch (fallbackError) {
        EdgeLogger.error('Enhanced orchestration fallback failed', fallbackError);
        return createErrorResponse(
          new Error(`Failed to obtain agent orchestration: ${fallbackError.message}`),
          500,
          'Enhanced orchestration fallback'
        );
      }
    }

    // Initialize enhanced service and generate response
    const enhancedService = new EnhancedAgentResponseService(supabase, openaiApiKey);
    const result = await enhancedService.generateAgentResponse(
      validatedOrchestrationResult,
      messageId,
      deliberationId,
      mode,
      {
        ...config,
        enhanced,
        requestId: `enhanced_${Date.now()}`
      }
    );

    EdgeLogger.info('Enhanced agent response generation completed', {
      success: result.success,
      enhanced: true,
      performance: result.performance
    });

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Enhanced edge function error', { error: error.message });
    return createErrorResponse(error, 500, 'Enhanced edge function');
  }
});
