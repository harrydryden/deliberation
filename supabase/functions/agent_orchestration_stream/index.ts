import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// SOPHISTICATED AGENT ORCHESTRATION WITH ALL SHARED FUNCTIONALITY INLINED
// ============================================================================

// Enhanced CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

interface AgentConfig {
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

interface AnalysisResult {
  intent: string;
  complexity: number;
  topicRelevance: number;
  requiresExpertise: boolean;
  confidence?: number;
  originalIntent?: string;
  content?: string;
}

interface ConversationContext {
  messageCount: number;
  recentMessages: any[];
  lastAgentType?: string;
  userEngagement?: any;
}

interface AgentCacheEntry {
  agent: AgentConfig | null;
  timestamp: number;
}

// ============================================================================
// ENHANCED EDGE LOGGER
// ============================================================================

class EdgeLogger {
  private static formatMessage(level: string, message: string, data?: any): string {
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
    console.warn(this.formatMessage('WARN', message, data));
  }

  static error(message: string, data?: any): void {
    console.error(this.formatMessage('ERROR', message, data));
  }
}

// ============================================================================
// MODEL CONFIGURATION MANAGER
// ============================================================================

interface ModelConfig {
  name: string;
  maxTokens: number;
  supportsTemperature: boolean;
  isReasoning: boolean;
}

class ModelConfigManager {
  private static readonly MODEL_CONFIGS: Record<string, ModelConfig> = {
    'gpt-5-2025-08-07': {
      name: 'gpt-5-2025-08-07',
      maxTokens: 4000,
      supportsTemperature: false,
      isReasoning: false
    },
    'gpt-5-mini-2025-08-07': {
      name: 'gpt-5-mini-2025-08-07',
      maxTokens: 4000,
      supportsTemperature: false,
      isReasoning: false
    },
    'gpt-4o-mini': {
      name: 'gpt-4o-mini',
      maxTokens: 4000,
      supportsTemperature: true,
      isReasoning: false
    }
  };

  static getModelConfig(modelName: string): ModelConfig | null {
    return this.MODEL_CONFIGS[modelName] || null;
  }

  static supportsFeature(modelName: string, feature: string): boolean {
    const config = this.getModelConfig(modelName);
    if (!config) return false;
    
    switch (feature) {
      case 'temperature':
        return config.supportsTemperature;
      case 'reasoning':
        return config.isReasoning;
      default:
        return false;
    }
  }

  static generateAPIParams(modelName: string, messages: any[], options: any = {}): any {
    const config = this.getModelConfig(modelName);
    if (!config) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const params: any = {
      model: modelName,
      messages,
      max_tokens: Math.min(config.maxTokens, options.maxTokens || config.maxTokens),
      stream: options.stream || false
    };

    if (config.supportsTemperature && options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    if (options.responseFormat === 'json') {
      params.response_format = { type: "json_object" };
    }

    return params;
  }
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'message_analysis';
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  constructor(private supabase: any) {}

  async isOpen(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      if (error) {
        EdgeLogger.warn('Circuit breaker state check failed, assuming closed', error);
        return false;
      }

      if (!data) {
        return false;
      }

      const now = Date.now();
      const lastFailureTime = new Date(data.last_failure_time).getTime();
      
      if (data.failure_count >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
        const timeSinceLastFailure = now - lastFailureTime;
        
        if (timeSinceLastFailure < CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT) {
          const remainingSeconds = Math.ceil((CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000);
          EdgeLogger.warn(`Circuit breaker OPEN - ${remainingSeconds}s remaining`);
          return true;
        } else {
          EdgeLogger.info('Circuit breaker timeout reached - resetting');
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

  async recordFailure(): Promise<void> {
    try {
      const now = new Date();
      
      const { data: currentState } = await this.supabase
        .from('circuit_breaker_state')
        .select('failure_count')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      const newFailureCount = (currentState?.failure_count || 0) + 1;
      
      const { error } = await this.supabase
        .from('circuit_breaker_state')
        .upsert({
          id: CircuitBreaker.CIRCUIT_BREAKER_ID,
          failure_count: newFailureCount,
          last_failure_time: now,
          is_open: newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
          updated_at: now
        }, {
          onConflict: 'id'
        });

      if (error) {
        EdgeLogger.error('Failed to record circuit breaker failure', error);
      } else {
        EdgeLogger.info(`Circuit breaker failure recorded: ${newFailureCount}/${CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`);
        
        if (newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
          EdgeLogger.warn('Circuit breaker ACTIVATED - analysis disabled for 1 minute');
        }
      }
    } catch (error) {
      EdgeLogger.error('Failed to record circuit breaker failure', error);
    }
  }

  async reset(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('circuit_breaker_state')
        .update({
          failure_count: 0,
          is_open: false,
          updated_at: new Date()
        })
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID);

      if (error) {
        EdgeLogger.error('Failed to reset circuit breaker', error);
  } else {
        EdgeLogger.info('Circuit breaker RESET');
      }
    } catch (error) {
      EdgeLogger.error('Failed to reset circuit breaker', error);
    }
  }
}

// ============================================================================
// SOPHISTICATED AGENT ORCHESTRATOR
// ============================================================================

class AgentOrchestrator {
  private supabase: any;
  private circuitBreaker: CircuitBreaker;
  private agentConfigCache = new Map<string, AgentCacheEntry>();
  private readonly AGENT_CACHE_DURATION = 1000 * 60 * 15; // 15 minutes
  private readonly MAX_AGENT_CACHE_SIZE = 200;

  constructor(supabase: any) {
    this.supabase = supabase;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  // Intent validation and normalization
  private validateIntent(intent: string): string {
    const intentMappings: Record<string, string> = {
      'participant_request': 'participant',
      'participant_input': 'participant', 
      'question_clarification': 'question',
      'policy_expertise': 'policy',
      'argument_perspective': 'argument'
    };
    
    return intentMappings[intent] || intent;
  }

  private deriveRequestFlags(intent: string, originalIntent: string, content: string): { isParticipantRequest: boolean, isQuestion: boolean } {
    const isParticipantRequest = originalIntent === 'participant_request' || 
                                this.detectParticipantRequest(content);
    const isQuestion = intent === 'question' || originalIntent === 'question_clarification';
    
    return { isParticipantRequest, isQuestion };
  }

  private detectParticipantRequest(content: string): boolean {
    const contentLower = content.toLowerCase();
    
    const participantsGroup = ['others?', 'people', 'participants?', 'members?', 'stakeholders?', 'citizens?', 'community', 'public', 'individuals?', 'groups?', 'voters?', 'constituents?'];
    const actionsGroup = ['said', 'mentioned', 'think', 'thought', 'contributed?', 'shared?', 'expressed?', 'raised?', 'brought up', 'discussed?', 'talked about'];
    const unitsGroup = ['issues?', 'points?', 'concerns?', 'problems?', 'topics?', 'matters?', 'questions?', 'perspectives?', 'viewpoints?', 'opinions?'];
    
    const patterns = [
      /\b(?:what\s+(?:have\s+)?(?:others?|people|participants?)\s+(?:have\s+)?(?:said|mentioned|contributed|shared|expressed|raised|discussed))\b/gi,
      new RegExp(`\\b(?:(?:what\\s+)?(?:${unitsGroup.join('|')})\\s+(?:have\s+)?(?:${participantsGroup.join('|')})\\s+(?:have\s+)?(?:${actionsGroup.join('|')}))\\b`, 'gi'),
      new RegExp(`\\b(?:(?:${participantsGroup.join('|')})\\s+(?:have\s+)?(?:${actionsGroup.join('|')})\\s+(?:${unitsGroup.join('|')}))\\b`, 'gi'),
      /\b(?:hear\s+(?:from\s+)?(?:what\s+)?(?:others?|people)|what\s+(?:do\s+)?(?:others?|people)\s+think)\b/gi,
      /\b(?:what\s+(?:issues?|points?|concerns?|topics?)\s+(?:have\s+)?(?:other\s+)?(?:others?|people|participants?|members?)\s+(?:have\s+)?(?:raised|mentioned|said)(?:\s+so\s+far)?)\b/gi,
      /\bother\s+(?:people|participants?|members?)\s+(?:have\s+)?(?:raised|mentioned|said)\b/gi
    ];

    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      p.lastIndex = 0;
      if (p.test(contentLower)) {
        return true;
      }
    }
    return false;
  }

  // Enhanced message analysis with circuit breaker
  async analyzeMessage(content: string, openAIApiKey: string, deliberationId?: string): Promise<AnalysisResult> {
  const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using intelligent defaults');
      return this.generateIntelligentDefaults(content);
    }

    const safeContent = content || '';
    const contentPreview = safeContent.length > 0 ? safeContent.substring(0, 100) + '...' : '[empty content]';
    
    EdgeLogger.info(`Starting analysis for: "${contentPreview}"`);

    const modelHierarchy = ['gpt-5-2025-08-07', 'gpt-4o-mini'];
    let lastError: any = null;
    
    for (const modelName of modelHierarchy) {
      try {
        EdgeLogger.debug(`Attempting analysis with model: ${modelName}`);
        
        const result = await this.attemptAnalysisWithModel(
          safeContent, 
          openAIApiKey, 
          modelName,
          startTime
        );

        if (result) {
          const duration = Date.now() - startTime;
          EdgeLogger.info(`Analysis success with ${modelName} in ${duration}ms`);
          await this.circuitBreaker.reset();
          return result;
        }
      } catch (error) {
        lastError = error;
        EdgeLogger.warn(`Analysis failed with ${modelName}`, error.message);
        continue;
      }
    }

    // All models failed
    const duration = Date.now() - startTime;
    EdgeLogger.error('All models failed, using intelligent defaults');
    await this.circuitBreaker.recordFailure();
    
    return this.generateIntelligentDefaults(content);
  }

  private async attemptAnalysisWithModel(
    content: string, 
    openAIApiKey: string, 
    modelName: string,
    startTime: number
  ): Promise<AnalysisResult> {
    const totalTimeoutMs = 8000;
    const remainingTime = Math.max(1000, totalTimeoutMs - (Date.now() - startTime));
    
    const systemMessage = `Analyze the user message for intent, complexity, and topic relevance. Return JSON with: intent (general/question/issue/argument), complexity (0.0-1.0), topicRelevance (0.0-1.0), requiresExpertise (boolean).`;

    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: content.trim() }
    ];

    const apiParams = ModelConfigManager.generateAPIParams(modelName, messages, {
      stream: false,
      responseFormat: 'json'
    });

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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const analysisContent = data.choices?.[0]?.message?.content;
    
    if (!analysisContent || analysisContent.trim().length === 0) {
      throw new Error('Empty analysis content received from OpenAI');
    }

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(analysisContent);
    } catch (parseError) {
      throw new Error(`Invalid JSON response from ${modelName}: ${analysisContent.substring(0, 100)}`);
    }

    const result: AnalysisResult = {
      intent: this.validateIntent(parsedResult.intent) || 'general',
      complexity: this.validateNumber(parsedResult.complexity, 0, 1) ?? 0.5,
      topicRelevance: this.validateNumber(parsedResult.topicRelevance, 0, 1) ?? 0.5,
      requiresExpertise: Boolean(parsedResult.requiresExpertise),
      confidence: this.validateNumber(parsedResult.confidence, 0, 1) ?? 0.8,
      originalIntent: parsedResult.intent,
      content
    };

    return result;
  }

  private validateNumber(value: any, min: number, max: number): number | null {
    const num = Number(value);
    if (!isNaN(num) && num >= min && num <= max) {
      return num;
    }
    return null;
  }

  // Enhanced intelligent defaults
  public generateIntelligentDefaults(content: string): AnalysisResult {
    const contentLength = content.length;
    const contentLower = content.toLowerCase();
    const wordCount = content.split(/\s+/).length;
    
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
        pattern: /\b(participant|member|stakeholder|citizen|community|public|people|individual|group|voters|constituents|others?|participants?|said|mentioned|think|contributed?|shared?|expressed?)\b/gi,
        weight: 0.6
      }
    };

    const matches = Object.entries(keywords).reduce((acc, [key, config]) => {
      const found = (contentLower.match(config.pattern) || []).length;
      acc[key] = { count: found, score: found * config.weight };
      return acc;
    }, {} as Record<string, { count: number; score: number }>);

    let intent = 'general';
    const hasParticipantRequest = this.detectParticipantRequest(content);
    
    if (hasParticipantRequest) {
      intent = 'participant_request';
    } else if (matches.policy.score > 0.5 || matches.expertise.score > 1) {
      intent = 'policy_expertise';
    } else if (matches.question.score > 0.3) {
      intent = 'question_clarification';  
    } else if (matches.argument.score > 0.4) {
      intent = 'argument_perspective';
    } else if (matches.participant.score > 0.3) {
      intent = 'participant_input';
    }

    const complexityFactors = [
      Math.min(1.0, contentLength / 500),
      Math.min(1.0, matches.complex.score / 2),
      Math.min(1.0, matches.expertise.score / 1.5)
    ];
    const complexity = Math.min(1.0, complexityFactors.reduce((sum, factor) => sum + factor, 0) / complexityFactors.length);

    const totalScore = Object.values(matches).reduce((sum, m) => sum + m.score, 0);
    const normalizedScore = Math.min(1.0, totalScore / Math.max(1, contentLength / 40));
    const topicRelevance = Math.max(0.3, normalizedScore);

    const requiresExpertise = matches.policy.score > 0.5 || matches.expertise.score > 1.2 || 
                             matches.complex.score > 1.0 || complexity > 0.7;

    const normalizedIntent = this.validateIntent(intent);
    
    return {
      intent: normalizedIntent,
      complexity: Math.round(complexity * 100) / 100,
      topicRelevance: Math.round(topicRelevance * 100) / 100,
      requiresExpertise,
      confidence: 0.8,
      originalIntent: intent,
      content
    };
  }

  // Agent configuration fetching with caching
  async getAgentConfig(agentType: string, deliberationId?: string): Promise<AgentConfig | null> {
    const cacheKey = `${agentType}:${deliberationId || 'global'}`;
    
    const cached = this.agentConfigCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.AGENT_CACHE_DURATION) {
      EdgeLogger.debug(`Agent config cache hit: ${agentType}`);
      return cached.agent;
    }
    
    try {
      let agentConfig: AgentConfig | null = null;

      // Try local agent for this deliberation
      if (deliberationId) {
        const { data: localAgent, error: localError } = await this.supabase
          .from('agent_configurations')
          .select('*')
          .eq('deliberation_id', deliberationId)
          .eq('agent_type', agentType)
          .eq('is_active', true)
          .maybeSingle();
        
        if (!localError && localAgent) {
          agentConfig = localAgent;
        }
      }
      
      // Fallback to global agent
      if (!agentConfig) {
        const { data: globalAgent, error: globalError } = await this.supabase
          .from('agent_configurations')
          .select('*')
          .eq('agent_type', agentType)
          .eq('is_default', true)
          .is('deliberation_id', null)
          .eq('is_active', true)
          .maybeSingle();
        
        if (!globalError && globalAgent) {
          agentConfig = globalAgent;
        }
      }
      
      this.cacheAgentConfig(cacheKey, agentConfig);
      return agentConfig;
      
      } catch (error) {
      EdgeLogger.error(`Failed to fetch ${agentType} agent configuration`, error);
      this.cacheAgentConfig(cacheKey, null);
      return null;
    }
  }

  private cacheAgentConfig(key: string, agent: AgentConfig | null): void {
    if (this.agentConfigCache.size >= this.MAX_AGENT_CACHE_SIZE) {
      this.cleanupAgentCache();
    }
    
    this.agentConfigCache.set(key, {
      agent,
      timestamp: Date.now()
    });
  }

  private cleanupAgentCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.agentConfigCache.entries()) {
      if ((now - entry.timestamp) > this.AGENT_CACHE_DURATION) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.agentConfigCache.delete(key));
    EdgeLogger.debug(`Agent cache cleanup: removed ${keysToDelete.length} entries`);
  }

  // Sophisticated agent selection algorithm
  async selectOptimalAgent(
    analysis: AnalysisResult, 
    conversationContext: ConversationContext,
    deliberationId?: string,
    availableKnowledge?: Record<string, boolean>
  ): Promise<string> {
    const agentTypes = ['bill_agent', 'peer_agent', 'flow_agent'];
    const agentConfigs = new Map<string, AgentConfig | null>();
    
    const configPromises = agentTypes.map(async (type) => {
      const config = await this.getAgentConfig(type, deliberationId);
      agentConfigs.set(type, config);
      return { type, config };
    });
    
    await Promise.all(configPromises);

    // Check IBIS node count
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
        EdgeLogger.error('Error fetching IBIS node count', error);
      }
    }

    EdgeLogger.info(`IBIS nodes in deliberation: ${ibisNodeCount}`);
    
    const scores = {
      bill_agent: 0,
      peer_agent: 0,
      flow_agent: 0
    };

    const { isParticipantRequest, isQuestion } = this.deriveRequestFlags(
      analysis.intent, 
      (analysis as any).originalIntent || analysis.intent, 
      (analysis as any).content || ''
    );
    
    EdgeLogger.info(`Request flags - isParticipantRequest: ${isParticipantRequest}, isQuestion: ${isQuestion}`);

    const factors = {
      complexity: analysis.complexity || 0.5,
      requiresExpertise: analysis.requiresExpertise || false,
      intent: analysis.intent || 'general',
      originalIntent: (analysis as any).originalIntent || analysis.intent,
      isParticipantRequest,
      isQuestion,
      topicRelevance: analysis.topicRelevance || 0.5,
      messageCount: conversationContext.messageCount || 0,
      ibisNodeCount
    };

    // Base scoring
    let billScore = 10 + (factors.complexity * 15);
    let peerScore = 8 + (factors.topicRelevance * 12);
    let flowScore = 6 + (Math.min(factors.complexity, 0.6) * 10);

    // Intent-based adjustments
    if (factors.intent === 'policy' || factors.requiresExpertise) {
      billScore += 18;
      EdgeLogger.debug(`Policy/expertise boost: +18 points for ${factors.intent}`);
    } else if (factors.intent === 'participant' || factors.intent === 'argument') {
      peerScore += 12;
      EdgeLogger.debug(`Participant synthesis boost: +12 points for ${factors.intent}`);
    } else if (factors.intent === 'question') {
      const questionBoost = isParticipantRequest ? 2 : 8;
      flowScore += questionBoost;
      EdgeLogger.debug(`Process clarification boost: +${questionBoost} points for ${factors.intent}`);
    }
    
    // Participant request boost
    if (isParticipantRequest) {
      peerScore += 25;
      EdgeLogger.info(`PARTICIPANT REQUEST: Peer agent boost: +25 points`);
    }

    // IBIS node count adjustments
    if (ibisNodeCount !== undefined) {
      if (ibisNodeCount < 5) {
        if (!isParticipantRequest) {
          const flowBoost = Math.max(8, 16 - (ibisNodeCount * 2));
          flowScore += flowBoost;
          EdgeLogger.debug(`Flow agent boost: +${flowBoost} points (${ibisNodeCount}/10 nodes)`);
          
          const peerPenalty = Math.max(2, 6 - (ibisNodeCount * 1));
          peerScore -= peerPenalty;
          EdgeLogger.debug(`Peer agent penalty: -${peerPenalty} points (${ibisNodeCount}/10 nodes)`);
        }
      } else if (ibisNodeCount >= 8) {
        const peerBoost = Math.min(15, 5 + ibisNodeCount);
        peerScore += peerBoost;
        EdgeLogger.debug(`Peer agent boost: +${peerBoost} points (${ibisNodeCount} nodes)`);
      }
    }

    // Agent availability checks
    const availableAgents = {
      bill_agent: agentConfigs.get('bill_agent')?.is_active !== false,
      peer_agent: agentConfigs.get('peer_agent')?.is_active !== false,
      flow_agent: agentConfigs.get('flow_agent')?.is_active !== false
    };

    const finalScores = {
      bill_agent: availableAgents.bill_agent ? billScore : -1,
      peer_agent: availableAgents.peer_agent ? peerScore : -1,
      flow_agent: availableAgents.flow_agent ? flowScore : -1
    };

    const sortedAgents = Object.entries(finalScores)
      .filter(([_, score]) => score >= 0)
      .sort(([,a], [,b]) => b - a);

    let finalSelection = sortedAgents.length > 0 ? sortedAgents[0][0] : 'flow_agent';

    // Participant request hard override
    if (isParticipantRequest && availableAgents.peer_agent && finalSelection !== 'peer_agent') {
      finalSelection = 'peer_agent';
    }

    EdgeLogger.info(`Agent selection results:`, {
      scores: { bill_agent: billScore, peer_agent: peerScore, flow_agent: flowScore },
      factors,
      selected: finalSelection,
      ibisNodeCount
    });

    return finalSelection;
  }

  // System prompt generation
  async generateSystemPrompt(agentConfig: AgentConfig | null, agentType: string, context?: any): Promise<string> {
    if (agentConfig?.prompt_overrides?.system_prompt) {
      return this.enhancePromptWithContext(agentConfig.prompt_overrides.system_prompt, agentType, {
        ...context,
        agentConfig
      });
    }
    
    if (agentConfig) {
      let prompt = `You are ${agentConfig.name}`;
      
      if (agentConfig.description) {
        prompt += `, ${agentConfig.description}`;
      }
      
      if (agentConfig.goals?.length) {
        prompt += `\n\nYour goals are:\n${agentConfig.goals.map(g => `- ${g}`).join('\n')}`;
      }
      
      if (agentConfig.response_style) {
        prompt += `\n\nResponse style: ${agentConfig.response_style}`;
        
        const standardMatch = agentConfig.response_style.match(/Keep responses to no more than (\d+) characters/);
        if (standardMatch) {
          const characterLimit = parseInt(standardMatch[1]);
          prompt += `\n\n⚠️ CRITICAL: Your response must be NO MORE THAN ${characterLimit} CHARACTERS. This is a hard limit that must be strictly enforced. Keep responses concise and focused.`;
        }
      }
      
      return this.enhancePromptWithContext(prompt, agentType, {
        ...context,
        agentConfig
      });
    }
    
    // Fallback to basic prompt
    return this.enhancePromptWithContext(`You are a helpful AI assistant for deliberation discussions.`, agentType, {
      ...context,
      agentConfig
    });
  }

  private enhancePromptWithContext(prompt: string, agentType: string, context?: any): string {
    if (!context) return prompt;

    // Add character limit instructions
    if (context.agentConfig) {
      let characterLimit = context.agentConfig?.max_response_characters;
      
      if (!characterLimit && context.agentConfig?.response_style) {
        const standardMatch = context.agentConfig.response_style.match(/Keep responses to no more than (\d+) characters/);
        if (standardMatch) {
          characterLimit = parseInt(standardMatch[1]);
        }
      }
      
      if (characterLimit && !prompt.includes('CRITICAL: Your response must be NO MORE THAN')) {
        prompt += `\n\n⚠️ CRITICAL: Your response must be NO MORE THAN ${characterLimit} CHARACTERS. This is a hard limit that must be strictly enforced. Keep responses concise and focused.`;
      }
    }

    if (context.complexity > 0.7) {
      prompt += "\n\nThis is a complex query requiring detailed analysis and nuanced understanding.";
    }

    // IBIS node context for peer_agent
    if (agentType === 'peer_agent') {
        if (context.similarNodes?.length > 0) {
        prompt += `\n\nCURRENT DELIBERATION IBIS MAP:`;
        prompt += `\nThe following ${context.similarNodes.length} points have been contributed to this deliberation's IBIS discussion map:\n`;
        
        context.similarNodes.forEach((node: any, index: number) => {
          prompt += `\n${index + 1}. **${node.title}** (${node.node_type})`;
          if (node.description) {
            prompt += `\n   Description: ${node.description}`;
          }
          prompt += `\n   Added: ${new Date(node.created_at).toLocaleDateString()}`;
        });

        prompt += `\n\nIMPORTANT IBIS GUIDELINES:`;
        prompt += `\n- ONLY reference the IBIS points listed above that actually exist in this deliberation`;
        prompt += `\n- DO NOT fabricate or make up discussion points that are not listed`;
        prompt += `\n- If referencing an IBIS point, use its exact title as shown above`;
        prompt += `\n- When appropriate, encourage users to contribute new points to expand the deliberation map`;
        } else {
        prompt += `\n\nCURRENT IBIS STATUS: No IBIS discussion points have been created yet for this deliberation.`;
        prompt += `\nIMPORTANT: Do not reference any discussion points from the IBIS database, as none exist yet.`;
        prompt += `\nEncourage users to contribute structured arguments and positions to build the deliberation map.`;
      }
    }

    if (context.knowledgeContext && context.knowledgeContext.length > 0) {
      prompt += `\n\nRELEVANT KNOWLEDGE CONTEXT:\n${context.knowledgeContext}\n\nUse this knowledge to inform your response when relevant, but always provide balanced and comprehensive information.`;
    }

    prompt += "\n\nUse British English spelling and grammar throughout your response.";
    return prompt;
  }

  // Model selection
  selectOptimalModel(analysis: AnalysisResult, agentConfig?: AgentConfig): string {
    if (agentConfig?.preferred_model) {
      return agentConfig.preferred_model;
    }
    return 'gpt-5-2025-08-07';
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  EdgeLogger.error(`${context || 'Edge Function'} Error`, { errorId, error: error?.message });
  
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

async function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
    
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

      return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    userSupabase: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
  };
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('Agent orchestration stream function called', { 
      method: req.method, 
      url: req.url 
    });

    const { supabase: serviceClient } = await validateAndGetEnvironment();
    
    // Track processing time for metadata
    const startTime = Date.now();
    
    // Extract user token for authenticated operations
    const authHeader = req.headers.get('authorization');
    let userClient = serviceClient;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const userToken = authHeader.substring(7);
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        
        if (supabaseUrl && supabaseAnonKey) {
          userClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
            global: {
              headers: {
                authorization: authHeader
              }
            }
          });
          EdgeLogger.info('Using authenticated user client');
        }
      } catch (error) {
        EdgeLogger.warn('Failed to create authenticated client, using service role', error);
      }
    }

    // Parse request body
    const requestBody = await req.json();
    const { 
      message, 
      deliberationId,
      conversationContext = {},
      mode = 'chat'
    } = requestBody;

    if (!message || !deliberationId) {
      return createErrorResponse(
        new Error('Missing required fields: message and deliberationId'),
        400,
        'Request validation'
      );
    }

    EdgeLogger.info('Processing orchestration request', {
      deliberationId,
      messageLength: message.length,
      mode,
      hasConversationContext: Object.keys(conversationContext).length > 0
    });

    // Initialize sophisticated AgentOrchestrator
    const orchestrator = new AgentOrchestrator(serviceClient);
    const openAIApiKey = getOpenAIKey();

    // Analyze the message with sophisticated AI analysis
    const analysis = await orchestrator.analyzeMessage(message, openAIApiKey, deliberationId);
    EdgeLogger.info('Message analysis completed', analysis);

    // Select optimal agent using sophisticated algorithm
    const selectedAgentType = await orchestrator.selectOptimalAgent(
      analysis, 
      conversationContext, 
      deliberationId
    );
    EdgeLogger.info('Agent selected', { selectedAgentType });

    // Get agent configuration
    const agentConfig = await orchestrator.getAgentConfig(selectedAgentType, deliberationId);
    if (!agentConfig) {
      return createErrorResponse(
        new Error(`No active configuration found for agent type: ${selectedAgentType}`),
        404,
        'Agent configuration'
      );
    }

    // Generate sophisticated system prompt
    const systemPrompt = await orchestrator.generateSystemPrompt(agentConfig, selectedAgentType, {
      analysis,
      conversationContext,
      deliberationId
    });

    // Select optimal model
    const selectedModel = orchestrator.selectOptimalModel(analysis, agentConfig);

    // Prepare response with sophisticated metadata
    const response = {
      success: true,
      selectedAgent: {
        type: selectedAgentType,
        name: agentConfig.name,
        description: agentConfig.description,
        model: selectedModel
      },
      analysis: {
        intent: analysis.intent,
        complexity: analysis.complexity,
        topicRelevance: analysis.topicRelevance,
        requiresExpertise: analysis.requiresExpertise,
        confidence: analysis.confidence
      },
      systemPrompt,
      conversationContext,
      timestamp: new Date().toISOString(),
      metadata: {
        processingTimeMs: Date.now() - startTime,
        requestId: crypto.randomUUID(),
        version: '2.0.0',
        features: {
          circuitBreaker: true,
          enhancedLogging: true,
          sophisticatedAnalysis: true,
          modelSelection: true,
          fallbackSupport: true
        },
        performance: {
          messageAnalysisTime: analysis.processingTime || 0,
          agentSelectionTime: Date.now() - startTime - (analysis.processingTime || 0),
          totalProcessingTime: Date.now() - startTime
        }
      }
    };

    EdgeLogger.info('Orchestration completed successfully', {
      selectedAgent: selectedAgentType,
      model: selectedModel,
      intent: analysis.intent,
      complexity: analysis.complexity
    });

    return createSuccessResponse(response);

  } catch (error) {
    EdgeLogger.error('Agent orchestration stream error', error);
    
    // Fallback response when orchestration fails
    const fallbackResponse = {
      success: false,
      error: 'Orchestration service temporarily unavailable',
      fallback: {
        selectedAgent: {
          type: 'facilitator_agent',
          name: 'Default Facilitator',
          description: 'Fallback agent for basic facilitation',
          model: 'gpt-4o-mini'
        },
        analysis: {
          intent: 'general',
          complexity: 1,
          topicRelevance: 0.5,
          requiresExpertise: false,
          confidence: 0.3
        },
        systemPrompt: 'You are a helpful facilitator. Please assist the user with their request.',
        conversationContext: {},
        timestamp: new Date().toISOString(),
        metadata: {
          processingTimeMs: Date.now() - startTime,
          requestId: crypto.randomUUID(),
          version: '2.0.0',
          features: {
            circuitBreaker: true,
            enhancedLogging: true,
            sophisticatedAnalysis: false,
            modelSelection: false,
            fallbackSupport: true
          },
          performance: {
            messageAnalysisTime: 0,
            agentSelectionTime: 0,
            totalProcessingTime: Date.now() - startTime
          },
          fallbackReason: error.message || 'Unknown error'
        }
      }
    };
    
    return createSuccessResponse(fallbackResponse);
  }
});
