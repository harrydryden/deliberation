// Unified Agent Orchestration Service
// Single source of truth for agent configuration, model selection, and prompt generation

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  agent_type: string;
  goals?: string[];
  response_style?: string;
  is_active: boolean;
  is_default: boolean;
  deliberation_id?: string;
  prompt_overrides?: {
    system_prompt?: string;
  };
  facilitator_config?: Record<string, any>;
  preferred_model?: string;
}

export interface AnalysisResult {
  intent: string;
  complexity: number;
  topicRelevance: number;
  requiresExpertise: boolean;
  confidence?: number;
}

export interface ConversationContext {
  messageCount: number;
  recentMessages: any[];
  lastAgentType?: string;
  userEngagement?: any;
}

// Agent configuration cache with proper cache management
interface AgentCacheEntry {
  agent: AgentConfig | null;
  timestamp: number;
}

const agentConfigCache = new Map<string, AgentCacheEntry>();
const AGENT_CACHE_DURATION = 1000 * 60 * 15; // 15 minutes
const MAX_AGENT_CACHE_SIZE = 200;

export class AgentOrchestrator {
  private supabase: any;
  
  constructor(supabase: any) {
    this.supabase = supabase;
  }

  // Standardized model selection - always use flagship model
  selectOptimalModel(analysis: AnalysisResult, agentConfig?: AgentConfig): string {
    // Check agent-specific model preference first
    if (agentConfig?.preferred_model) {
      return agentConfig.preferred_model;
    }
    
    // Always use best model available
    return 'gpt-5-2025-08-07';
  }

  // UNIFIED AGENT CONFIGURATION FETCHING with optimized caching
  async getAgentConfig(agentType: string, deliberationId?: string): Promise<AgentConfig | null> {
    const cacheKey = `${agentType}:${deliberationId || 'global'}`;
    
    console.log(`🔄 Fetching agent config: ${agentType} for deliberation: ${deliberationId}`);
    
    // Check cache first - proper cache behavior
    const cached = agentConfigCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < AGENT_CACHE_DURATION) {
      console.log(`🚀 Agent config cache hit: ${agentType}`);
      return cached.agent;
    }
    
    try {
      let agentConfig: AgentConfig | null = null;

      // Step 1: Try local agent for this deliberation
      if (deliberationId) {
        const { data: localAgent, error: localError } = await this.supabase
          .from('agent_configurations')
          .select('*')
          .eq('deliberation_id', deliberationId)
          .eq('agent_type', agentType)
          .eq('is_active', true)
          .maybeSingle();
        
        if (localError) {
          console.warn(`Error fetching local ${agentType} agent:`, localError);
        }
        
        if (localAgent) {
          console.log(`✅ Found local ${agentType} agent`);
          agentConfig = localAgent;
        }
      }
      
      // Step 2: Fallback to global agent
      if (!agentConfig) {
        console.log(`No local ${agentType} agent found, trying global agent`);
        const { data: globalAgent, error: globalError } = await this.supabase
          .from('agent_configurations')
          .select('*')
          .eq('agent_type', agentType)
          .eq('is_default', true)
          .is('deliberation_id', null)
          .eq('is_active', true)
          .maybeSingle();
        
        if (globalError) {
          console.warn(`Error fetching global ${agentType} agent:`, globalError);
        }
        
        if (globalAgent) {
          console.log(`✅ Found global ${agentType} agent`);
          agentConfig = globalAgent;
        }
      }
      
      // Cache the result (including null)
      this.cacheAgentConfig(cacheKey, agentConfig);
      
      return agentConfig;
      
    } catch (error) {
      console.error(`Failed to fetch ${agentType} agent configuration:`, error);
      // Cache null result to avoid repeated failures
      this.cacheAgentConfig(cacheKey, null);
      return null;
    }
  }

  // UNIFIED SYSTEM PROMPT GENERATION
  async generateSystemPrompt(agentConfig: AgentConfig | null, agentType: string, context?: any): Promise<string> {
    if (agentConfig?.prompt_overrides?.system_prompt) {
      // Use custom system prompt if available
      return this.enhancePromptWithContext(agentConfig.prompt_overrides.system_prompt, agentType, {
        ...context,
        agentConfig // Pass agent config to enhance method
      });
    }
    
    if (agentConfig) {
      // Auto-generate from agent configuration
      let prompt = `You are ${agentConfig.name}`;
      
      if (agentConfig.description) {
        prompt += `, ${agentConfig.description}`;
      }
      
      if (agentConfig.goals?.length) {
        prompt += `\n\nYour goals are:\n${agentConfig.goals.map(g => `- ${g}`).join('\n')}`;
      }
      
      if (agentConfig.response_style) {
        prompt += `\n\nResponse style: ${agentConfig.response_style}`;
        
        // Extract and emphasize character limits - prioritize standardized phrase
        const standardMatch = agentConfig.response_style.match(/Keep responses to no more than (\d+) characters/);
        if (standardMatch) {
          const characterLimit = parseInt(standardMatch[1]);
          prompt += `\n\n⚠️ CRITICAL: Your response must be NO MORE THAN ${characterLimit} CHARACTERS. This is a hard limit that must be strictly enforced. Keep responses concise and focused.`;
        } else {
          // Fallback to flexible regex for existing agents
          const responseStyle = agentConfig.response_style.toLowerCase();
          const characterMatch = responseStyle.match(/(?:no more than|maximum|max|limit.*?to)\s*(\d+)\s*characters?/);
          if (characterMatch) {
            const characterLimit = parseInt(characterMatch[1]);
            prompt += `\n\n⚠️ CRITICAL: Your response must be NO MORE THAN ${characterLimit} CHARACTERS. This is a hard limit that must be strictly enforced. Keep responses concise and focused.`;
          }
        }
      }
      
      return this.enhancePromptWithContext(prompt, agentType, {
        ...context,
        agentConfig // Pass agent config to enhance method
      });
    }
    
    // Fallback to database prompt templates
    return this.enhancePromptWithContext(await this.getPromptTemplateDefault(agentType), agentType, {
      ...context,
      agentConfig // Pass agent config even for templates to add character limits
    });
  }

  // Fetch default prompt from database prompt templates
  private async getPromptTemplateDefault(agentType: string): Promise<string> {
    try {
      const templateName = `agent_default_${agentType}`;
      
      const { data, error } = await this.supabase
        .from('prompt_templates')
        .select('template_text')
        .eq('name', templateName)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) {
        console.warn(`Failed to fetch prompt template ${templateName}:`, error);
        return this.getHardcodedFallback(agentType);
      }
      
      if (data?.template_text) {
        console.log(`✅ Using database prompt template: ${templateName}`);
        return data.template_text;
      }
      
      console.log(`⚠️ No template found for ${templateName}`);
      throw new Error(`Template ${templateName} not found in database`);
      
    } catch (error) {
      console.error('Error fetching prompt template:', error);
      throw new Error(`Failed to fetch template ${templateName}: ${error.message}`);
    }
  }

  // Helper method to get system message from template
  private async getSystemMessage(templateName: string): Promise<string> {
    try {
      const { data: templateData, error } = await this.supabase
        .rpc('get_prompt_template', { template_name: templateName });

      if (error) {
        console.error(`RPC error getting template ${templateName}:`, error);
        return this.getFallbackTemplate(templateName);
      }

      if (templateData && templateData.length > 0 && templateData[0].template_text) {
        return templateData[0].template_text;
      }

      console.warn(`Template ${templateName} not found or empty, using fallback`);
      return this.getFallbackTemplate(templateName);
    } catch (error) {
      console.error(`Failed to get template ${templateName}:`, error);
      return this.getFallbackTemplate(templateName);
    }
  }

  private getFallbackTemplate(templateName: string): string {
    const fallbacks = {
      'message_analysis_system_message': 'Analyze the user message for intent, complexity, and topic relevance. Return JSON with: intent (general/question/issue/argument), complexity (0.0-1.0), topicRelevance (0.0-1.0), requiresExpertise (boolean).',
      'default': 'You are a helpful AI assistant. Provide a thoughtful response to the user.'
    };
    
    return fallbacks[templateName] || fallbacks['default'];
  }

  // ENHANCED AGENT SELECTION ALGORITHM
  async selectOptimalAgent(
    analysis: AnalysisResult, 
    conversationContext: ConversationContext,
    deliberationId?: string,
    availableKnowledge?: Record<string, boolean>
  ): Promise<string> {
    // Get available agent configurations for this deliberation
    const agentTypes = ['bill_agent', 'peer_agent', 'flow_agent'];
    const agentConfigs = new Map<string, AgentConfig | null>();
    
    // Fetch all agent configs in parallel
    const configPromises = agentTypes.map(async (type) => {
      const config = await this.getAgentConfig(type, deliberationId);
      agentConfigs.set(type, config);
      return { type, config };
    });
    
    await Promise.all(configPromises);

    // Check IBIS node count for Flow vs Peer agent prioritization
    let ibisNodeCount = 0;
    if (deliberationId) {
      try {
        const { data: nodeData, error } = await this.supabase
          .from('ibis_nodes')
          .select('id')
          .eq('deliberation_id', deliberationId);
        
        if (!error && nodeData) {
          ibisNodeCount = nodeData.length;
        }
      } catch (error) {
        console.error('Error fetching IBIS node count:', error);
      }
    }

    console.log(`📊 IBIS nodes in deliberation: ${ibisNodeCount}`);
    
    const scores = {
      bill_agent: 0,
      peer_agent: 0,
      flow_agent: 0
    };

    // Enhanced scoring with agent configuration awareness
    const factors = {
      complexity: analysis.complexity || 0.5,
      requiresExpertise: analysis.requiresExpertise || false,
      intent: analysis.intent || 'general',
      topicRelevance: analysis.topicRelevance || 0.5,
      messageCount: conversationContext.messageCount || 0,
      recentMessageTypes: this.getRecentMessageTypes(conversationContext.recentMessages || []),
      hasKnowledge: availableKnowledge || {},
      ibisNodeCount
    };

    // Bill Agent scoring - normalized to max ~100 points
    const billConfig = agentConfigs.get('bill_agent');
    if (billConfig?.is_active !== false) {
      scores.bill_agent += factors.complexity * 30;  // Reduced from 40
      scores.bill_agent += factors.requiresExpertise ? 25 : 0;  // Reduced from 30
      scores.bill_agent += factors.topicRelevance * 20;  // Reduced from 25
      scores.bill_agent += factors.intent.includes('policy') ? 15 : 0;  // Reduced from 20
      scores.bill_agent += factors.intent.includes('legal') ? 15 : 0;  // Reduced from 20
      scores.bill_agent += factors.intent.includes('legislation') ? 20 : 0;  // Reduced from 25
      scores.bill_agent += factors.hasKnowledge.bill_agent ? 10 : 0;  // Reduced from 15
    }

    // Peer Agent scoring - gets stronger as IBIS grows
    const peerConfig = agentConfigs.get('peer_agent');
    if (peerConfig?.is_active !== false) {
      scores.peer_agent += factors.messageCount > 5 ? 25 : 0;  
      scores.peer_agent += factors.messageCount >= 3 && factors.messageCount <= 5 ? 15 : 0;  
      scores.peer_agent += factors.intent.includes('participant') ? 30 : 0;  
      scores.peer_agent += factors.intent.includes('perspective') ? 25 : 0;  
      scores.peer_agent += this.getRecentBillAgentCount(factors.recentMessageTypes) > 2 ? 20 : 0;  
      scores.peer_agent += factors.hasKnowledge.peer_agent ? 10 : 0;  
      
      // CRITICAL: Progressive scoring based on IBIS development
      if (factors.ibisNodeCount < 10) {
        // Penalty when IBIS is underdeveloped
        const reductionFactor = Math.max(0, (10 - factors.ibisNodeCount) / 10);  
        const penalty = Math.floor(reductionFactor * 15);  
        scores.peer_agent -= penalty;
        console.log(`🚫 Peer agent penalty: -${penalty} points (${factors.ibisNodeCount}/10 nodes - building structure)`);
      } else {
        // Progressive boost as IBIS matures (10+ nodes = ready for peer synthesis)
        const boostFactor = Math.min(1, (factors.ibisNodeCount - 10) / 20);  // 0-1 over next 20 nodes  
        const boost = Math.floor(boostFactor * 25);  // Up to 25 point boost
        scores.peer_agent += boost;
        console.log(`🎯 Peer agent boost: +${boost} points (${factors.ibisNodeCount} nodes - mature for synthesis)`);
      }
    }

    // Flow Agent scoring - dominates early conversation, reduces as IBIS matures
    const flowConfig = agentConfigs.get('flow_agent');
    if (flowConfig?.is_active !== false) {
      scores.flow_agent += factors.messageCount < 3 ? 30 : 0;  
      scores.flow_agent += factors.messageCount >= 3 && factors.messageCount <= 5 ? 20 : 0;  
      scores.flow_agent += factors.intent.includes('question') ? 25 : 0;  
      scores.flow_agent += factors.intent.includes('clarify') ? 30 : 0;  
      scores.flow_agent += factors.complexity < 0.3 ? 20 : 0;  
      scores.flow_agent += this.getRecentFlowAgentCount(factors.recentMessageTypes) === 0 ? 15 : 0;  
      scores.flow_agent += factors.hasKnowledge.flow_agent ? 10 : 0;  
      
      // CRITICAL: Progressive scoring that favors structure-building early, then steps back
      if (factors.ibisNodeCount < 10) {
        // Strong boost when building initial structure
        const boostFactor = Math.max(0, (10 - factors.ibisNodeCount) / 10);  
        const boost = Math.floor(boostFactor * 20);  
        scores.flow_agent += boost;
        console.log(`🚀 Flow agent boost: +${boost} points (${factors.ibisNodeCount}/10 nodes - building structure)`);
      } else {
        // Gradual reduction as IBIS matures and peer agent takes over
        const reductionFactor = Math.min(1, (factors.ibisNodeCount - 10) / 15);  // 0-1 over next 15 nodes
        const penalty = Math.floor(reductionFactor * 20);  // Up to 20 point penalty  
        scores.flow_agent -= penalty;
        console.log(`📉 Flow agent reduction: -${penalty} points (${factors.ibisNodeCount} nodes - peer synthesis phase)`);
      }
    }

    // Anti-repetition logic
    const lastAgentType = this.getLastAgentType(factors.recentMessageTypes);
    if (lastAgentType && scores[lastAgentType as keyof typeof scores] !== undefined) {
      scores[lastAgentType as keyof typeof scores] -= 10;
    }

    // Select agent with highest score, defaulting to flow_agent
    const selectedAgent = Object.entries(scores).reduce((max, [agent, score]) => 
      score > max.score ? { agent, score } : max, 
      { agent: 'flow_agent', score: -1 }
    ).agent;

    console.log(`🔬 Enhanced agent scoring results:`, {
      scores,
      factors,
      selected: selectedAgent,
      ibisNodeCount: factors.ibisNodeCount,
      flowBoosted: factors.ibisNodeCount < 10,
      availableConfigs: Object.fromEntries(
        Array.from(agentConfigs.entries()).map(([type, config]) => [type, !!config])
      )
    });

    return selectedAgent;
  }

  // Circuit breaker configuration - persistent via database
  private static readonly CIRCUIT_BREAKER_ID = 'message_analysis';
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  // ENHANCED MESSAGE ANALYSIS with Persistent Circuit Breaker
  async analyzeMessage(content: string, openAIApiKey: string, deliberationId?: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    // Circuit breaker check - persistent via database
    if (await this.isCircuitBreakerOpen()) {
      console.warn('🚫 Circuit breaker OPEN - skipping analysis, using intelligent defaults');
      await this.recordAnalysisMetrics('analysis', null, false, Date.now() - startTime, 'Circuit breaker open', deliberationId);
      return this.generateIntelligentDefaults(content);
    }

    const safeContent = content || '';
    const contentPreview = safeContent.length > 0 ? safeContent.substring(0, 100) + '...' : '[empty content]';
    
    console.log(`🔍 [ANALYSIS] Starting optimized analysis for: "${contentPreview}"`);

    // Streamlined model hierarchy - only 2 models for performance
    const modelHierarchy = [
      'gpt-5-2025-08-07',
      'gpt-4o-mini'  // Direct fallback for reliability
    ];

    let lastError: any = null;
    
    // Try each model with 8 second total timeout
    for (const modelName of modelHierarchy) {
      try {
        console.log(`🤖 [ANALYSIS] Attempting with model: ${modelName}`);
        
        const result = await this.attemptAnalysisWithModel(
          safeContent, 
          openAIApiKey, 
          modelName,
          startTime
        );

        if (result) {
          const duration = Date.now() - startTime;
          console.log(`✅ [ANALYSIS] Success with ${modelName} in ${duration}ms`);
          await this.recordAnalysisMetrics('analysis', modelName, true, duration, null, deliberationId);
          return result;
        }
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ [ANALYSIS] ${modelName} failed:`, error.message);
        continue; // Try next model
      }
    }

    // All models failed - record failure and use intelligent fallback
    const duration = Date.now() - startTime;
    console.error('❌ [ANALYSIS] All models failed, recording failure and using intelligent defaults');
    await this.recordAnalysisFailure();
    await this.recordAnalysisMetrics('analysis', 'all_failed', false, duration, lastError?.message, deliberationId);
    
    return this.generateIntelligentDefaults(content);
  }

  // Streamlined analysis attempt with 8-second total timeout
  private async attemptAnalysisWithModel(
    content: string, 
    openAIApiKey: string, 
    modelName: string,
    startTime: number
  ): Promise<AnalysisResult> {
    const totalTimeoutMs = 8000; // Total timeout for all attempts
    const remainingTime = Math.max(1000, totalTimeoutMs - (Date.now() - startTime));
    
    console.log(`🎯 [ANALYSIS] Model ${modelName}, ${remainingTime}ms remaining`);

    const systemMessage = await this.getSystemMessage('message_analysis_system_message');
    console.log(`📝 [ANALYSIS] System message length: ${systemMessage.length} chars`);

    // Use ModelConfigManager for proper parameter handling
    const { ModelConfigManager } = await import('./model-config.ts');
    
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: content.trim() }
    ];

    // Generate API params with proper model configuration
    const apiParams = ModelConfigManager.generateAPIParams(modelName, messages, {
      stream: false
    });

    // Enhanced response validation for newer models
    if (!ModelConfigManager.supportsFeature(modelName, 'temperature')) {
      console.log(`🔧 [ANALYSIS] Using text response for newer model ${modelName}`);
    } else {
      apiParams.response_format = { type: "json_object" };
      console.log(`🔧 [ANALYSIS] Using JSON response for legacy model ${modelName}`);
    }

    console.log(`📤 [ANALYSIS] API request params:`, {
      model: apiParams.model,
      tokens: apiParams.max_tokens || apiParams.max_completion_tokens,
      hasResponseFormat: !!apiParams.response_format,
      hasTemperature: !!apiParams.temperature
    });

    // Make the API call with remaining time timeout
    const analysisPromise = fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiParams),
    });

    const response = await Promise.race([
      analysisPromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Analysis timeout after ${remainingTime}ms`)), remainingTime)
      )
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`📡 [ANALYSIS] Response received: ${response.status} in ${elapsed}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [ANALYSIS] OpenAI error ${response.status}:`, errorText.substring(0, 200));
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const analysisContent = data.choices?.[0]?.message?.content;
    
    console.log(`📄 [ANALYSIS] Raw response:`, analysisContent?.substring(0, 200) + '...');

    // Enhanced response validation
    if (!analysisContent || analysisContent.trim().length === 0) {
      console.warn(`❌ Empty/invalid response from ${modelName}`);
      throw new Error('Empty analysis content received from OpenAI');
    }

    // Parse response (handle both JSON and text responses)
    let parsedResult: any;
    
    if (apiParams.response_format?.type === "json_object") {
      try {
        parsedResult = JSON.parse(analysisContent);
      } catch (parseError) {
        console.error(`❌ [ANALYSIS] JSON parse error:`, parseError);
        throw new Error(`Invalid JSON response from ${modelName}: ${analysisContent.substring(0, 100)}`);
      }
    } else {
      parsedResult = this.parseTextAnalysisResponse(analysisContent);
    }

    console.log(`🔧 [ANALYSIS] Parsed result:`, parsedResult);

    // Validate and format the result
    const result: AnalysisResult = {
      intent: this.validateIntent(parsedResult.intent) || 'general',
      complexity: this.validateNumber(parsedResult.complexity, 0, 1) ?? 0.5,
      topicRelevance: this.validateNumber(parsedResult.topicRelevance, 0, 1) ?? 0.5,
      requiresExpertise: Boolean(parsedResult.requiresExpertise),
      confidence: this.validateNumber(parsedResult.confidence, 0, 1) ?? 0.8
    };

    console.log(`✅ [ANALYSIS] Validated result:`, result);
    return result;
  }

  private parseTextAnalysisResponse(content: string): any {
    // Extract JSON from text response for newer models
    try {
      // Look for JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback: parse structured text response
      const lines = content.split('\n').map(l => l.trim()).filter(l => l);
      const result: any = {};
      
      for (const line of lines) {
        if (line.includes('intent')) {
          const match = line.match(/intent.*?[:=]\s*"?([^"]+)"?/i);
          if (match) result.intent = match[1].trim();
        }
        if (line.includes('complexity')) {
          const match = line.match(/complexity.*?[:=]\s*([0-9.]+)/i);
          if (match) result.complexity = parseFloat(match[1]);
        }
        if (line.includes('topicRelevance') || line.includes('topic_relevance')) {
          const match = line.match(/topic[_\s]?relevance.*?[:=]\s*([0-9.]+)/i);
          if (match) result.topicRelevance = parseFloat(match[1]);
        }
        if (line.includes('requiresExpertise') || line.includes('requires_expertise')) {
          const match = line.match(/requires[_\s]?expertise.*?[:=]\s*(true|false)/i);
          if (match) result.requiresExpertise = match[1].toLowerCase() === 'true';
        }
      }
      
      console.log(`🔧 [ANALYSIS] Parsed from text:`, result);
      return result;
    } catch (error) {
      console.error(`❌ [ANALYSIS] Text parsing failed:`, error);
      throw new Error(`Failed to parse text analysis response: ${content.substring(0, 100)}`);
    }
  }

  // Persistent Circuit breaker management via database
  private async isCircuitBreakerOpen(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('id', AgentOrchestrator.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      if (error) {
        console.warn('Circuit breaker state check failed, assuming closed:', error);
        return false;
      }

      if (!data) {
        // No circuit breaker record, it's closed
        return false;
      }

      const now = Date.now();
      const lastFailureTime = new Date(data.last_failure_time).getTime();
      
      if (data.failure_count >= AgentOrchestrator.CIRCUIT_BREAKER_THRESHOLD) {
        const timeSinceLastFailure = now - lastFailureTime;
        
        if (timeSinceLastFailure < AgentOrchestrator.CIRCUIT_BREAKER_TIMEOUT) {
          return true; // Circuit is still open
        } else {
          // Reset circuit breaker after timeout
          console.log('🔄 Circuit breaker timeout reached, resetting');
          await this.resetCircuitBreaker();
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.warn('Circuit breaker check failed, assuming closed:', error);
      return false;
    }
  }

  private async recordAnalysisFailure(): Promise<void> {
    try {
      const now = new Date();
      
      // Get current state
      const { data: currentState } = await this.supabase
        .from('circuit_breaker_state')
        .select('failure_count')
        .eq('id', AgentOrchestrator.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      const newFailureCount = (currentState?.failure_count || 0) + 1;
      
      // Upsert circuit breaker state with incremented failure count
      const { error } = await this.supabase
        .from('circuit_breaker_state')
        .upsert({
          id: AgentOrchestrator.CIRCUIT_BREAKER_ID,
          failure_count: newFailureCount,
          last_failure_time: now,
          is_open: newFailureCount >= AgentOrchestrator.CIRCUIT_BREAKER_THRESHOLD,
          updated_at: now
        }, {
          onConflict: 'id'
        });

      if (error) {
        console.error('Failed to record analysis failure:', error);
      } else {
        console.log(`📊 Analysis failure recorded: ${newFailureCount}/${AgentOrchestrator.CIRCUIT_BREAKER_THRESHOLD}`);
        
        if (newFailureCount >= AgentOrchestrator.CIRCUIT_BREAKER_THRESHOLD) {
          console.warn('🚫 Circuit breaker ACTIVATED - analysis disabled for 1 minute');
        }
      }
    } catch (error) {
      console.error('Failed to record analysis failure:', error);
    }
  }

  private async resetCircuitBreaker(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('circuit_breaker_state')
        .update({
          failure_count: 0,
          is_open: false,
          updated_at: new Date()
        })
        .eq('id', AgentOrchestrator.CIRCUIT_BREAKER_ID);

      if (error) {
        console.error('Failed to reset circuit breaker:', error);
      }
    } catch (error) {
      console.error('Failed to reset circuit breaker:', error);
    }
  }

  // Analysis metrics tracking
  private async recordAnalysisMetrics(
    operationType: string,
    model: string | null,
    success: boolean,
    durationMs: number,
    errorMessage?: string | null,
    deliberationId?: string
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('analysis_metrics')
        .insert({
          operation_type: operationType,
          model_used: model,
          success: success,
          duration_ms: durationMs,
          error_message: errorMessage,
          deliberation_id: deliberationId
        });

      if (error) {
        console.warn('Failed to record analysis metrics:', error);
      }
    } catch (error) {
      console.warn('Failed to record analysis metrics:', error);
    }
  }

  private validateIntent(intent: any): string | null {
    const validIntents = ['policy', 'legal', 'legislation', 'participant', 'perspective', 'question', 'clarify', 'general'];
    if (typeof intent === 'string' && validIntents.includes(intent.toLowerCase())) {
      return intent.toLowerCase();
    }
    return null;
  }

  private validateNumber(value: any, min: number, max: number): number | null {
    const num = Number(value);
    if (!isNaN(num) && num >= min && num <= max) {
      return num;
    }
    return null;
  }

  // Enhanced intelligent defaults with improved keyword analysis
  public generateIntelligentDefaults(content: string): AnalysisResult {
    const contentLength = content.length;
    const contentLower = content.toLowerCase();
    const wordCount = content.split(/\s+/).length;
    const sentenceCount = (content.match(/[.!?]+/g) || []).length;
    const questionCount = (content.match(/\?/g) || []).length;
    
    console.log(`🧠 [DEFAULTS] Generating optimized defaults for ${contentLength} chars, ${wordCount} words`);
    
    // Enhanced keyword analysis with weighted scoring
    const keywords = {
      policy: { 
        pattern: /\b(policy|policies|law|laws|legal|legislation|bill|congress|senate|government|regulation|act|constitutional|federal|state|local)\b/gi,
        weight: 0.9
      },
      question: { 
        pattern: /\b(what|why|how|when|where|who|can you|could you|would you|\?|help me understand|explain)\b/gi,
        weight: 0.7
      },
      complex: { 
        pattern: /\b(analyze|analysis|complex|comprehensive|detailed|intricate|sophisticated|nuanced|multifaceted|implications|consequences)\b/gi,
        weight: 0.8
      },
      expertise: { 
        pattern: /\b(expert|professional|technical|specialized|advanced|academic|research|study|studies|scientific|evidence|data)\b/gi,
        weight: 0.85
      },
      argument: { 
        pattern: /\b(argue|argument|debate|disagree|oppose|support|claim|assert|contend|position|stance|counter|refute)\b/gi,
        weight: 0.75
      },
      participant: { 
        pattern: /\b(participant|member|stakeholder|citizen|community|public|people|individual|group|voters|constituents)\b/gi,
        weight: 0.6
      },
      perspective: { 
        pattern: /\b(perspective|viewpoint|opinion|view|belief|think|feel|consider|believe|personally|my view)\b/gi,
        weight: 0.65
      },
      clarify: { 
        pattern: /\b(clarify|explain|elaborate|detail|specify|expand|unclear|confused|understand|help me|can you help)\b/gi,
        weight: 0.7
      }
    };

    // Count weighted matches for each category
    const matches = Object.entries(keywords).reduce((acc, [key, config]) => {
      const found = (contentLower.match(config.pattern) || []).length;
      acc[key] = { count: found, score: found * config.weight };
      return acc;
    }, {} as Record<string, { count: number; score: number }>);

    // Determine intent based on weighted scores with priority order
    let intent = 'general';
    const totalScore = Object.values(matches).reduce((sum, m) => sum + m.score, 0);
    
    if (matches.policy.score > 0.5 || matches.expertise.score > 1) {
      intent = 'policy_expertise';
    } else if (matches.question.score > 0.3 || matches.clarify.score > 0.4) {
      intent = 'question_clarification';  
    } else if (matches.argument.score > 0.4 || matches.perspective.score > 0.5) {
      intent = 'argument_perspective';
    } else if (matches.participant.score > 0.3) {
      intent = 'participant_input';
    }

    // Calculate complexity based on weighted factors (0.0 to 1.0)
    const complexityFactors = [
      Math.min(1.0, contentLength / 500), // Length factor
      Math.min(1.0, matches.complex.score / 2), // Complex keywords weighted
      Math.min(1.0, matches.expertise.score / 1.5), // Expertise keywords weighted  
      sentenceCount > 5 ? 0.3 : 0.1, // Sentence structure
      questionCount > 2 ? 0.2 : 0.0 // Multiple questions
    ];
    const complexity = Math.min(1.0, complexityFactors.reduce((sum, factor) => sum + factor, 0) / complexityFactors.length);

    // Calculate topic relevance based on weighted scores (0.0 to 1.0)
    const normalizedScore = Math.min(1.0, totalScore / Math.max(1, contentLength / 40));
    const topicRelevance = Math.max(0.3, normalizedScore); // Minimum relevance of 0.3

    // Determine if expertise is required based on weighted thresholds
    const requiresExpertise = matches.policy.score > 0.5 || matches.expertise.score > 1.2 || 
                             matches.complex.score > 1.0 || complexity > 0.7;

    const result: AnalysisResult = {
      intent,
      complexity: Math.round(complexity * 100) / 100,
      topicRelevance: Math.round(topicRelevance * 100) / 100,
      requiresExpertise,
      confidence: 0.8
    };

    console.log(`🧠 [DEFAULTS] Optimized result:`, {
      ...result,
      factors: {
        contentLength,
        wordCount,
        totalScore,
        weightedMatches: Object.fromEntries(
          Object.entries(matches).map(([k, v]) => [k, v.score])
        )
      }
    });
    
    return result;
  }

  // CACHE MANAGEMENT
  private cacheAgentConfig(key: string, agent: AgentConfig | null): void {
    // Clean up cache if it's getting too large
    if (agentConfigCache.size >= MAX_AGENT_CACHE_SIZE) {
      this.cleanupAgentCache();
    }
    
    agentConfigCache.set(key, {
      agent,
      timestamp: Date.now()
    });
  }

  private cleanupAgentCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    // Remove expired entries
    for (const [key, entry] of agentConfigCache.entries()) {
      if ((now - entry.timestamp) > AGENT_CACHE_DURATION) {
        keysToDelete.push(key);
      }
    }
    
    // If still too many, remove oldest entries
    if (agentConfigCache.size - keysToDelete.length > MAX_AGENT_CACHE_SIZE) {
      const sortedEntries = Array.from(agentConfigCache.entries())
        .filter(([key]) => !keysToDelete.includes(key))
        .sort(([,a], [,b]) => a.timestamp - b.timestamp);
      
      const toRemove = sortedEntries.slice(0, 20);
      keysToDelete.push(...toRemove.map(([key]) => key));
    }
    
    keysToDelete.forEach(key => agentConfigCache.delete(key));
    console.log(`🧹 Agent cache cleanup: removed ${keysToDelete.length} entries`);
  }

  // CACHE INVALIDATION
  invalidateAgentCache(agentType?: string, deliberationId?: string): void {
    if (agentType && deliberationId) {
      // Invalidate specific agent config
      const key = `${agentType}:${deliberationId}`;
      agentConfigCache.delete(key);
      // Also invalidate global version
      const globalKey = `${agentType}:global`;
      agentConfigCache.delete(globalKey);
    } else if (agentType) {
      // Invalidate all configs for this agent type
      for (const key of agentConfigCache.keys()) {
        if (key.startsWith(`${agentType}:`)) {
          agentConfigCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      agentConfigCache.clear();
    }
    console.log(`🔄 Invalidated agent cache: ${agentType || 'all'}`);
  }

  private enhancePromptWithContext(prompt: string, agentType: string, context?: any): string {
    if (!context) return prompt;

    // Add character limit instructions for database template prompts
    if (context.agentConfig) {
      let characterLimit = context.agentConfig?.max_response_characters;
      
      // Fallback to parsing response_style if max_response_characters not set
      if (!characterLimit && context.agentConfig?.response_style) {
        // Look for the standardized phrase first
        const standardMatch = context.agentConfig.response_style.match(/Keep responses to no more than (\d+) characters/);
        if (standardMatch) {
          characterLimit = parseInt(standardMatch[1]);
        } else {
          // Fallback to the more flexible regex for existing agents
          const responseStyle = context.agentConfig.response_style.toLowerCase();
          const characterMatch = responseStyle.match(/(?:no more than|maximum|max|limit.*?to)\s*(\d+)\s*characters?/);
          if (characterMatch) {
            characterLimit = parseInt(characterMatch[1]);
          }
        }
      }
      
      // Add character limit instruction if found and not already in template
      if (characterLimit && !prompt.includes('CRITICAL: Your response must be NO MORE THAN')) {
        prompt += `\n\n⚠️ CRITICAL: Your response must be NO MORE THAN ${characterLimit} CHARACTERS. This is a hard limit that must be strictly enforced. Keep responses concise and focused.`;
      }
    }

    if (context.complexity > 0.7) {
      prompt += "\n\nThis is a complex query requiring detailed analysis and nuanced understanding.";
    }

    // IBIS node context - ONLY for peer_agent (Pia)
    if (agentType === 'peer_agent') {
      if (context.similarNodes?.length > 0) {
        prompt += `\n\nCURRENT DELIBERATION IBIS MAP:`;
        prompt += `\nThe following ${context.similarNodes.length} points have been contributed to this deliberation's IBIS discussion map:\n`;
        
        context.similarNodes.forEach((node: any, index: number) => {
          prompt += `\n${index + 1}. **${node.title}** (${node.node_type})`;
          if (node.description) {
            prompt += `\n   Description: ${node.description}`;
          }
          if (node.relationships?.length > 0) {
            const relSummary = node.relationships.map((rel: any) => rel.relationship_type).join(', ');
            prompt += `\n   Relationships: ${relSummary}`;
          }
          prompt += `\n   Added: ${new Date(node.created_at).toLocaleDateString()}`;
        });

        prompt += `\n\nIMPORTANT IBIS GUIDELINES:`;
        prompt += `\n- ONLY reference the IBIS points listed above that actually exist in this deliberation`;
        prompt += `\n- DO NOT fabricate or make up discussion points that are not listed`;
        prompt += `\n- If referencing an IBIS point, use its exact title as shown above`;
        prompt += `\n- When appropriate, encourage users to contribute new points to expand the deliberation map`;
        prompt += `\n- If the IBIS map seems sparse, suggest that more perspectives would be valuable`;
      } else {
        prompt += `\n\nCURRENT IBIS STATUS: No IBIS discussion points have been created yet for this deliberation.`;
        prompt += `\nIMPORTANT: Do not reference any discussion points from the IBIS database, as none exist yet.`;
        prompt += `\nEncourage users to contribute structured arguments and positions to build the deliberation map.`;
      }
    } else {
      // For non-peer agents, explicitly state no IBIS access
      console.log(`🚫 IBIS access restricted for agent type: ${agentType}`);
      prompt += `\n\nIBIS ACCESS: You do not have access to the deliberation's IBIS discussion map. Focus on your specialized role without referencing specific discussion points or issues from the IBIS structure.`;
    }

    if (context.knowledgeContext && context.knowledgeContext.length > 0) {
      prompt += `\n\nRELEVANT KNOWLEDGE CONTEXT:\n${context.knowledgeContext}\n\nUse this knowledge to inform your response when relevant, but always provide balanced and comprehensive information.`;
    }

    // Add British English instruction
    prompt += "\n\nUse British English spelling and grammar throughout your response.";

    return prompt;
  }

  private getRecentMessageTypes(messages: any[]): string[] {
    return messages.slice(0, 5).map(m => m.message_type || 'unknown');
  }

  private getRecentBillAgentCount(messageTypes: string[]): number {
    return messageTypes.filter(type => type === 'bill_agent').length;
  }

  private getRecentFlowAgentCount(messageTypes: string[]): number {
    return messageTypes.filter(type => type === 'flow_agent').length;
  }

  private getLastAgentType(messageTypes: string[]): string | null {
    return messageTypes.find(type => type !== 'user') || null;
  }
}