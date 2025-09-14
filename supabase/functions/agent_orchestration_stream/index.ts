import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

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

interface EngagementMetrics {
  messageVelocity: number;      // Messages per hour in last 2 hours
  participantActivity: number;   // Active participants in last hour  
  conversationDepth: number;    // Average message length trend
  interactionPattern: 'initial' | 'building' | 'synthesizing' | 'concluding';
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

    // All models now use standard gpt-4o-mini parameters
    // Remove model-specific parameter handling

    const params: any = {
      model: modelName,
      messages,
      stream: options.stream || false
    };

    const maxTokens = Math.min(config.maxTokens, options.maxTokens || config.maxTokens);

    // gpt-4o-mini supports standard parameters
    params.max_tokens = maxTokens;
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
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5; // Increased from 3 to 5
  private static readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // Reduced from 60s to 30s

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
          EdgeLogger.warn(`Circuit breaker OPEN - ${remainingSeconds}s remaining`, { 
            failureCount: data.failure_count, 
            threshold: CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD 
          });
          return true;
        } else {
          EdgeLogger.info('Circuit breaker timeout reached - resetting', { 
            timeSinceLastFailure, 
            timeoutDuration: CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT 
          });
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
        EdgeLogger.info(`Circuit breaker failure recorded: ${newFailureCount}/${CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`, {
          deliberationId: this.constructor.name,
          timestamp: now.toISOString()
        });
        
        if (newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD) {
          EdgeLogger.warn(`Circuit breaker ACTIVATED - analysis disabled for ${CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT/1000}s`, {
            threshold: CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
            timeoutSeconds: CircuitBreaker.CIRCUIT_BREAKER_TIMEOUT/1000
          });
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

  // PHASE 1: Consolidated message intent analysis
  private analyzeMessageIntent(content: string, deliberationTopic?: string): {
    primary: 'off_topic' | 'participant_request' | 'policy_expertise' | 'deliberation_process' | 'general';
    secondary?: string;
    isParticipantRequest: boolean;
    isQuestion: boolean;
    isPolicyExpertise: boolean;
    isOffTopic: boolean;
    isDeliberationProcess: boolean;
    confidence: number;
  } {
    const contentLower = content.toLowerCase();
    
    // PRIORITY 1: Off-topic detection (highest priority - Flo handles)
    if (this.detectOffTopicRequest(content, deliberationTopic)) {
      return {
        primary: 'off_topic',
        isParticipantRequest: false,
        isQuestion: false,
        isPolicyExpertise: false,
        isOffTopic: true,
        isDeliberationProcess: false,
        confidence: 0.9
      };
    }
    
    // PRIORITY 2: Explicit participant requests (second priority - Pia handles)
    const isParticipantRequest = this.detectParticipantRequest(content);
    if (isParticipantRequest) {
      return {
        primary: 'participant_request',
        isParticipantRequest: true,
        isQuestion: false,
        isPolicyExpertise: false,
        isOffTopic: false,
        isDeliberationProcess: false,
        confidence: 0.85
      };
    }
    
    // PRIORITY 3: Policy/expertise signals (third priority - Bill handles)
    const isPolicyExpertise = this.detectPolicyExpertise(content);
    if (isPolicyExpertise) {
      return {
        primary: 'policy_expertise', 
        secondary: this.detectDeliberationProcessQuestion(content) ? 'deliberation_process' : undefined,
        isParticipantRequest: false,
        isQuestion: /\b(what|why|how|when|where|who|\?)\b/gi.test(contentLower),
        isPolicyExpertise: true,
        isOffTopic: false,
        isDeliberationProcess: false,
        confidence: 0.8
      };
    }
    
    // PRIORITY 4: Deliberation process questions (fourth priority - Flo handles)
    const isDeliberationProcess = this.detectDeliberationProcessQuestion(content);
    if (isDeliberationProcess) {
      return {
        primary: 'deliberation_process',
        isParticipantRequest: false,
        isQuestion: true,
        isPolicyExpertise: false,
        isOffTopic: false,
        isDeliberationProcess: true,
        confidence: 0.75
      };
    }
    
    // PRIORITY 5: Default conversation management (Flo handles)
    return {
      primary: 'general',
      isParticipantRequest: false,
      isQuestion: /\b(what|why|how|when|where|who|\?)\b/gi.test(contentLower),
      isPolicyExpertise: false,
      isOffTopic: false,
      isDeliberationProcess: false,
      confidence: 0.6
    };
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

  // Enhanced policy expertise detection
  private detectPolicyExpertise(content: string): boolean {
    const contentLower = content.toLowerCase();
    
    // Strong policy expertise indicators
    const strongPolicyPatterns = [
      /\b(?:constitutional\s+law|legal\s+precedent|statutory\s+interpretation|regulatory\s+framework)\b/gi,
      /\b(?:legislative\s+process|policy\s+analysis|legal\s+implications|compliance\s+requirements)\b/gi,
      /\b(?:how\s+does\s+the\s+law|what\s+does\s+the\s+statute|legal\s+definition\s+of)\b/gi,
      /\b(?:constitutional\s+basis|regulatory\s+authority|enforcement\s+mechanism)\b/gi
    ];
    
    // General policy and legal terms (broader detection)
    const policyKeywords = [
      'policy', 'policies', 'legislation', 'legislative', 'law', 'laws', 'legal', 'legally',
      'regulation', 'regulations', 'regulatory', 'statute', 'statutes', 'statutory',
      'government', 'governmental', 'governance', 'bill', 'act', 'amendment',
      'compliance', 'enforcement', 'jurisdiction', 'authority', 'framework',
      'implementation', 'requirement', 'requirements', 'provision', 'provisions'
    ];
    
    // Technical legal/policy terms
    const technicalTerms = [
      'amendment', 'subsection', 'provision', 'statute', 'ordinance', 'jurisdiction',
      'precedent', 'liability', 'compliance', 'enforcement', 'constitutional', 'federal', 'state'
    ];
    
    // Assisted dying specific policy terms
    const assistedDyingPolicyTerms = [
      'maid', 'medical assistance in dying', 'physician assisted', 'end of life care',
      'palliative care', 'terminal diagnosis', 'mental illness', 'safeguards',
      'eligibility criteria', 'waiting period', 'second opinion', 'capacity assessment'
    ];
    
    // Policy question patterns
    const policyQuestionPatterns = [
      /\b(?:what\s+(?:are\s+the\s+)?(?:laws?|regulations?|policies|requirements|rules|guidelines))\b/gi,
      /\b(?:how\s+(?:does\s+the\s+)?(?:law|policy|regulation|system)\s+work)\b/gi,
      /\b(?:who\s+(?:can|is\s+eligible|qualifies)\s+for)\b/gi,
      /\b(?:what\s+(?:are\s+the\s+)?(?:criteria|conditions|safeguards|protections))\b/gi,
      /\b(?:is\s+it\s+legal|legally\s+allowed|permitted\s+by\s+law)\b/gi,
      /\b(?:what\s+does\s+the\s+law\s+say|according\s+to\s+(?:law|policy))\b/gi
    ];
    
    // Check for strong patterns
    const hasStrongPatterns = strongPolicyPatterns.some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(contentLower);
    });
    
    // Check for policy question patterns
    const hasPolicyQuestions = policyQuestionPatterns.some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(contentLower);
    });
    
    // Check for general policy keywords
    const policyKeywordCount = policyKeywords.filter(keyword => 
      contentLower.includes(keyword)
    ).length;
    
    // Check for technical terms
    const technicalTermCount = technicalTerms.filter(term => 
      contentLower.includes(term)
    ).length;
    
    // Check for assisted dying policy terms
    const assistedDyingPolicyCount = assistedDyingPolicyTerms.filter(term => 
      contentLower.includes(term)
    ).length;
    
    // Contextual policy discussions (requires both policy term + analysis context)
    const hasContextualPolicy = /\b(?:policy|policies|legislation|regulation)\s+(?:analysis|interpretation|implications|framework|development)\b/gi.test(contentLower);
    
    // More inclusive detection logic
    return hasStrongPatterns || 
           hasPolicyQuestions ||
           policyKeywordCount >= 1 || // Lowered threshold from 2 to 1
           technicalTermCount >= 1 || // Lowered threshold from 2 to 1  
           assistedDyingPolicyCount >= 1 ||
           hasContextualPolicy;
  }

  // Detect deliberation process questions for flow agent
  private detectDeliberationProcessQuestion(content: string): boolean {
    const contentLower = content.toLowerCase();
    
    const processKeywords = [
      'how.*deliberation.*work', 'what.*rules', 'how.*process', 'how.*this.*work',
      'what.*supposed.*do', 'how.*participate', 'what.*next', 'how.*contribute',
      'what.*guidelines', 'how.*discussion.*work', 'what.*format', 'what.*structure',
      'how.*engage', 'what.*expected', 'how.*should.*proceed', 'what.*steps'
    ];
    
    return processKeywords.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(contentLower);
    });
  }

  // Detect off-topic requests that need redirection
  private detectOffTopicRequest(content: string, deliberationTopic?: string): boolean {
    const contentLower = content.toLowerCase();
    
    // Direct topic change requests
    const topicChangePatterns = [
      /\b(?:can\s+we\s+talk\s+about\s+something\s+else|let.?s\s+change\s+the\s+(?:subject|topic)|move\s+on\s+to|discuss\s+something\s+different)\b/gi,
      /\b(?:instead\s+of.*let.?s|rather\s+than.*can\s+we|what\s+about.*instead|how\s+about\s+we\s+talk\s+about)\b/gi,
      /\b(?:enough\s+about|tired\s+of|bored\s+with|sick\s+of).*(?:this|that|topic|subject)\b/gi,
      /\b(?:other\s+than|aside\s+from|besides).*(?:assisted\s+dying|euthanasia|end.?of.?life)\b/gi
    ];
    
    // Check for explicit topic change requests
    const hasTopicChangeRequest = topicChangePatterns.some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(contentLower);
    });
    
    if (hasTopicChangeRequest) {
      return true;
    }
    
    // For assisted dying deliberations, check if content is clearly off-topic
    if (deliberationTopic && deliberationTopic.toLowerCase().includes('assisted dying')) {
      const assistedDyingKeywords = [
        'assisted dying', 'euthanasia', 'end of life', 'medical assistance in dying', 'maid',
        'physician assisted', 'terminal illness', 'palliative care', 'dignity', 'suffering',
        'pain management', 'quality of life', 'autonomy', 'medical ethics', 'healthcare decisions'
      ];
      
      const hasRelevantKeywords = assistedDyingKeywords.some(keyword => 
        contentLower.includes(keyword.toLowerCase())
      );
      
      // If message is longer than 20 words and has no relevant keywords, it might be off-topic
      const wordCount = content.trim().split(/\s+/).length;
      if (wordCount > 20 && !hasRelevantKeywords) {
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

    // Simplified model hierarchy - gpt-4o-mini as main model
    const modelHierarchy = ['gpt-4o-mini'];
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
    // Simplified timeout configuration - consistent for all models
    const timeoutMs = modelName === 'gpt-4o-mini' ? 12000 : 15000;
    
    EdgeLogger.debug(`Model timeout configuration`, {
      model: modelName,
      timeout: timeoutMs
    });
    
    // Standard system message for all models
    const systemMessage = `Analyze the user message for intent, complexity, and topic relevance. Return JSON with: intent (general/question/issue/argument), complexity (0.0-1.0), topicRelevance (0.0-1.0), requiresExpertise (boolean).`;

    // Standard content length limit
    const maxContentLength = 1000;
    const trimmedContent = content.length > maxContentLength ? 
      content.substring(0, maxContentLength) + '...' : content;

    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: trimmedContent.trim() }
    ];

    // Use JSON mode for structured responses
    const useJsonFormat = true;
    const apiParams = ModelConfigManager.generateAPIParams(modelName, messages, {
      stream: false,
      responseFormat: useJsonFormat ? 'json' : undefined
    });
    
    EdgeLogger.debug(`API request configuration`, {
      model: modelName,
      useJsonFormat,
      messageCount: messages.length,
      contentLength: trimmedContent.length,
      requestSizeEstimate: JSON.stringify(apiParams).length
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
          setTimeout(() => reject(new Error(`Analysis timeout after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);

    // Phase 2: Enhanced error handling with response validation
    if (!response.ok) {
      const errorText = await response.text();
      EdgeLogger.error(`OpenAI API error details`, {
        status: response.status,
        statusText: response.statusText,
        model: modelName,
        errorPreview: errorText.substring(0, 200),
        responseSize: errorText.length
      });
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const analysisContent = data.choices?.[0]?.message?.content;
    
    // Log OpenAI Request ID for debugging
    const requestId = response.headers.get('X-Request-ID');
    if (requestId) {
      EdgeLogger.debug(`OpenAI Request ID: ${requestId}`, { model: modelName });
    }
    
    // Phase 2: Better response validation
    if (!analysisContent || analysisContent.trim().length === 0) {
      EdgeLogger.warn(`Empty response from ${modelName}`, {
        responseData: data,
        model: modelName,
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length
      });
      throw new Error('Empty analysis content received from OpenAI');
    }

    EdgeLogger.debug(`API response received`, {
      model: modelName,
      contentLength: analysisContent.length,
      responseSize: JSON.stringify(data).length,
      requestId,
      jsonMode: useJsonFormat,
      elapsedTime: Date.now() - startTime
    });

    let parsedResult: any;
    try {
      // Enhanced JSON parsing with fallback for complex responses
      if (useJsonFormat) {
        parsedResult = JSON.parse(analysisContent);
      } else {
        // For non-JSON responses, try to extract structured data or use intelligent parsing
        parsedResult = this.parseNonJsonResponse(analysisContent);
      }
    } catch (parseError) {
      EdgeLogger.warn(`JSON parsing failed for ${modelName}`, {
        error: parseError.message,
        contentPreview: analysisContent.substring(0, 200),
        model: modelName,
        useJsonFormat
      });
      
      // Enhanced extraction fallback for non-JSON responses
      if (useJsonFormat) {
        EdgeLogger.info(`Attempting intelligent parsing fallback for ${modelName}`);
        parsedResult = this.parseNonJsonResponse(analysisContent);
      } else {
        // Try extractAnalysisFromText fallback
        const extractedResult = this.extractAnalysisFromText(analysisContent);
        if (extractedResult) {
          parsedResult = extractedResult;
          EdgeLogger.info(`Successfully extracted analysis from non-JSON response`, { model: modelName });
        } else {
          throw new Error(`Failed to parse response from ${modelName}: ${parseError.message}`);
        }
      }
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

  // Phase 2: New method for parsing non-JSON responses
  private parseNonJsonResponse(content: string): any {
    EdgeLogger.debug('Attempting intelligent parsing of non-JSON response');
    
    // Try to extract key information using regex patterns
    const intentMatch = content.match(/intent[:\s]+([a-zA-Z_]+)/i);
    const complexityMatch = content.match(/complexity[:\s]+([0-9.]+)/i);
    const relevanceMatch = content.match(/(?:topic\s*)?relevance[:\s]+([0-9.]+)/i);
    const expertiseMatch = content.match(/(?:requires\s*)?expertise[:\s]+(true|false|yes|no)/i);
    
    return {
      intent: intentMatch?.[1]?.toLowerCase() || 'general',
      complexity: parseFloat(complexityMatch?.[1] || '0.5'),
      topicRelevance: parseFloat(relevanceMatch?.[1] || '0.5'),
      requiresExpertise: /true|yes/i.test(expertiseMatch?.[1] || 'false'),
      confidence: 0.6 // Lower confidence for parsed responses
    };
  }

  // Alternative text extraction method for non-JSON responses
  private extractAnalysisFromText(content: string): any {
    EdgeLogger.debug('Attempting text extraction from response');
    
    // More flexible patterns for natural language responses
    const patterns = {
      intent: /(?:intent|type|category).*?(?:is|:|=)\s*([a-zA-Z_]+)/i,
      complexity: /(?:complexity|difficult).*?(?:is|:|=)\s*([0-9.]+)/i,
      topicRelevance: /(?:relevance|relevant).*?(?:is|:|=)\s*([0-9.]+)/i,
      requiresExpertise: /(?:expertise|expert|requires).*?(?:is|:|=)\s*(true|false|yes|no)/i
    };

    const extracted: any = {};
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = content.match(pattern);
      if (match) {
        if (key === 'requiresExpertise') {
          extracted[key] = /true|yes/i.test(match[1]);
        } else if (key === 'intent') {
          extracted[key] = match[1].toLowerCase();
        } else {
          extracted[key] = parseFloat(match[1]) || 0.5;
        }
      }
    }

    // Return null if we couldn't extract meaningful data
    if (Object.keys(extracted).length < 2) {
      return null;
    }

    return {
      intent: extracted.intent || 'general',
      complexity: extracted.complexity || 0.5,
      topicRelevance: extracted.topicRelevance || 0.5,
      requiresExpertise: extracted.requiresExpertise || false,
      confidence: 0.5 // Lower confidence for extracted responses
    };
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
    
    // PHASE 2: Multi-tier policy detection for more accurate intent classification
    const policyExpertise = {
      // Requires deep policy knowledge
      strongPolicy: /\b(constitutional\s+law|legal\s+precedent|statutory\s+interpretation|regulatory\s+framework|legislative\s+process|policy\s+analysis|legal\s+implications|compliance\s+requirements)\b/gi,
      
      // Complex policy questions  
      policyQuestions: /\b(how\s+does\s+the\s+law|what\s+does\s+the\s+statute|legal\s+definition\s+of|constitutional\s+basis|regulatory\s+authority|enforcement\s+mechanism)\b/gi,
      
      // Specific legal/policy terms
      technicalTerms: /\b(amendment|subsection|provision|statute|ordinance|jurisdiction|precedent|liability|compliance|enforcement)\b/gi
    };

    const civicDiscussion = {
      // Basic government mentions - should NOT trigger policy intent
      basicCivic: /\b(government|federal|state|local|congress|senate)\b/gi,
      
      // Should only trigger policy with additional context
      contextualPolicy: /\b(policy|policies|legislation|regulation)\s+(analysis|interpretation|implications|framework|development)\b/gi
    };

    // Calculate sophisticated policy intent score
    const getPolicyIntentScore = (content: string): number => {
      const strongMatches = (content.match(policyExpertise.strongPolicy) || []).length * 2.0;
      const questionMatches = (content.match(policyExpertise.policyQuestions) || []).length * 1.5;  
      const technicalMatches = (content.match(policyExpertise.technicalTerms) || []).length * 1.0;
      const contextualMatches = (content.match(civicDiscussion.contextualPolicy) || []).length * 1.0;
      
      // Basic civic mentions don't contribute to policy score
      return strongMatches + questionMatches + technicalMatches + contextualMatches;
    };

    const keywords = {
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
    
    // Enhanced policy detection using multi-tier system
    const policyIntentScore = getPolicyIntentScore(content);
    const requiresExpertise = policyIntentScore > 1.5; // Requires stronger evidence
    
    if (hasParticipantRequest) {
      intent = 'participant_request';
    } else if (requiresExpertise) {
      intent = 'policy_expertise';
      EdgeLogger.debug(`Policy expertise detected - score: ${policyIntentScore}`);
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

    const requiresExpertiseFromMatches = requiresExpertise || matches.expertise.score > 1.2 || 
                             matches.complex.score > 1.0 || complexity > 0.7;

    const normalizedIntent = this.validateIntent(intent);
    
    return {
      intent: normalizedIntent,
      complexity: Math.round(complexity * 100) / 100,
      topicRelevance: Math.round(topicRelevance * 100) / 100,
      requiresExpertise: requiresExpertiseFromMatches,
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

  // PHASE 3: Engagement metrics calculation for contextual agent selection
  private async calculateEngagementMetrics(deliberationId: string): Promise<EngagementMetrics> {
    try {
      if (!deliberationId) {
        // Return default metrics if no deliberation ID
        return {
          messageVelocity: 0,
          participantActivity: 1,
          conversationDepth: 0.5,
          interactionPattern: 'initial'
        };
      }

      // Message velocity (messages/hour last 2 hours)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: recentMessages, error: messagesError } = await this.supabase
        .from('messages')
        .select('created_at, content')
        .eq('deliberation_id', deliberationId)
        .gte('created_at', twoHoursAgo);
        
      const messageVelocity = recentMessages ? recentMessages.length / 2 : 0; // per hour
      
      // Active participants (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: activeParticipants, error: participantsError } = await this.supabase
        .from('participants') 
        .select('user_id')
        .eq('deliberation_id', deliberationId)
        .gte('last_active', oneHourAgo);
        
      const participantActivity = activeParticipants ? activeParticipants.length : 1;
      
      // Conversation depth trend
      const avgLength = recentMessages && recentMessages.length > 0
        ? recentMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0) / recentMessages.length
        : 100;
      const conversationDepth = Math.min(1.0, avgLength / 200);
      
      // Interaction pattern detection
      let interactionPattern: 'initial' | 'building' | 'synthesizing' | 'concluding' = 'initial';
      if (messageVelocity > 3 && participantActivity > 2) {
        interactionPattern = 'building';
      } else if (conversationDepth > 0.7) {
        interactionPattern = 'synthesizing';  
      } else if (messageVelocity < 1 && conversationDepth > 0.5) {
        interactionPattern = 'concluding';
      }
      
      EdgeLogger.debug('Engagement metrics calculated', {
        messageVelocity: Math.round(messageVelocity * 100) / 100,
        participantActivity,
        conversationDepth: Math.round(conversationDepth * 100) / 100,
        interactionPattern,
        deliberationId
      });
      
      return { messageVelocity, participantActivity, conversationDepth, interactionPattern };
    } catch (error) {
      EdgeLogger.warn('Failed to calculate engagement metrics, using defaults', error);
      return {
        messageVelocity: 0.5,
        participantActivity: 1,
        conversationDepth: 0.5,
        interactionPattern: 'initial'
      };
    }
  }

  // Sophisticated agent selection algorithm
  async selectOptimalAgent(
    analysis: AnalysisResult, 
    conversationContext: ConversationContext,
    deliberationId?: string,
    availableKnowledge?: Record<string, boolean>,
    mode: 'chat' | 'learn' = 'chat'
  ): Promise<string> {
    const agentTypes = ['bill_agent', 'peer_agent', 'flow_agent'];
    const agentConfigs = new Map<string, AgentConfig | null>();
    
    const configPromises = agentTypes.map(async (type) => {
      const config = await this.getAgentConfig(type, deliberationId);
      agentConfigs.set(type, config);
      return { type, config };
    });
    
    await Promise.all(configPromises);

    // Get deliberation details for topic detection
    let deliberationTopic = '';
    if (deliberationId) {
      try {
        const { data: deliberationData, error } = await this.supabase
          .from('deliberations')
          .select('title, notion')
          .eq('id', deliberationId)
          .single();
        
        if (!error && deliberationData) {
          deliberationTopic = `${deliberationData.title} ${deliberationData.notion || ''}`.trim();
        }
      } catch (error) {
        EdgeLogger.warn('Failed to fetch deliberation details for topic detection', error);
      }
    }

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

    // Force bill agent selection for learn mode (Policy Q&A)
    if (mode === 'learn') {
      EdgeLogger.info('LEARN MODE: Forcing bill_agent selection for Policy Q&A');
      return 'bill_agent';
    }

    // PHASE 1: Consolidated intent analysis
    const messageContent = (analysis as any).content || '';
    const intentAnalysis = this.analyzeMessageIntent(messageContent, deliberationTopic);
    
    EdgeLogger.info(`Intent analysis results:`, {
      primary: intentAnalysis.primary,
      secondary: intentAnalysis.secondary,
      confidence: intentAnalysis.confidence,
      flags: {
        isParticipantRequest: intentAnalysis.isParticipantRequest,
        isQuestion: intentAnalysis.isQuestion,
        isPolicyExpertise: intentAnalysis.isPolicyExpertise,
        isOffTopic: intentAnalysis.isOffTopic,
        isDeliberationProcess: intentAnalysis.isDeliberationProcess
      }
    });

    // PHASE 2: Normalized scoring system (15-30 range for fair competition)
    const baseScore = 15;
    const maxBonus = 15;
    
    let billScore = baseScore;
    let peerScore = baseScore;
    let flowScore = baseScore;

    // Add complexity-based adjustments (max +5 points)
    const complexityBonus = Math.min(5, (analysis.complexity || 0.5) * 5);
    billScore += complexityBonus;
    peerScore += Math.min(5, (analysis.topicRelevance || 0.5) * 5);
    flowScore += complexityBonus * 0.8; // Slightly lower complexity bonus for flow

    // PHASE 3: Primary intent-based scoring (follows detection hierarchy)
    switch (intentAnalysis.primary) {
      case 'off_topic':
        flowScore += 12; // Strong preference for flow agent
        EdgeLogger.debug(`Off-topic primary intent: +12 points for flow_agent`);
        break;
        
      case 'participant_request':
        peerScore += 12; // Strong preference for peer agent
        EdgeLogger.debug(`Participant request primary intent: +12 points for peer_agent`);
        
        // If also involves policy, give bill agent a chance
        if (intentAnalysis.isPolicyExpertise) {
          billScore += 6;
          EdgeLogger.debug(`Policy+participant combo: +6 points for bill_agent`);
        }
        break;
        
      case 'policy_expertise':
        billScore += 12; // Strong preference for bill agent
        EdgeLogger.debug(`Policy expertise primary intent: +12 points for bill_agent`);
        
        // Questions with policy expertise go to bill agent
        if (intentAnalysis.isQuestion) {
          billScore += 4;
          EdgeLogger.debug(`Policy question bonus: +4 points for bill_agent`);
        }
        break;
        
      case 'deliberation_process':
        flowScore += 12; // Strong preference for flow agent
        EdgeLogger.debug(`Deliberation process primary intent: +12 points for flow_agent`);
        break;
        
      case 'general':
        flowScore += 8; // Moderate preference for flow agent
        EdgeLogger.debug(`General conversation primary intent: +8 points for flow_agent`);
        
        // Questions go to flow unless they involve expertise
        if (intentAnalysis.isQuestion && !intentAnalysis.isPolicyExpertise) {
          flowScore += 4;
          EdgeLogger.debug(`General question bonus: +4 points for flow_agent`);
        }
        break;
    }

    // PHASE 4: Context-based adjustments
    const engagementMetrics = await this.calculateEngagementMetrics(deliberationId);
    
    // Synthesis phase boost for peer agent
    if (ibisNodeCount > 8 && engagementMetrics.interactionPattern === 'synthesizing') {
      peerScore += 6;
      EdgeLogger.debug(`Synthesis phase boost: +6 points for peer_agent`);
    }

    // Initial conversation phase boost for flow agent
    if (conversationContext.messageCount < 3 && engagementMetrics.interactionPattern === 'initial') {
      flowScore += 4;
      EdgeLogger.debug(`Initial conversation boost: +4 points for flow_agent`);
    }

    // High activity synthesis boost for peer agent
    if (engagementMetrics.messageVelocity > 5 && ibisNodeCount > 3) {
      peerScore += 4;
      EdgeLogger.debug(`High activity synthesis boost: +4 points for peer_agent`);
    }

    // PHASE 5: Agent availability check
    const availableAgents: Record<string, boolean> = {
      bill_agent: agentConfigs.get('bill_agent') !== null,
      peer_agent: agentConfigs.get('peer_agent') !== null,
      flow_agent: agentConfigs.get('flow_agent') !== null
    };

    // Apply availability constraints
    if (!availableAgents.bill_agent) billScore = -1000;
    if (!availableAgents.peer_agent) peerScore = -1000;
    if (!availableAgents.flow_agent) flowScore = -1000;

    const finalScores = {
      bill_agent: billScore,
      peer_agent: peerScore,
      flow_agent: flowScore
    };

    // PHASE 6: Conflict resolution for close scores
    const sortedAgents = Object.entries(finalScores)
      .filter(([, score]) => score > 0) // Only available agents
      .sort(([,a], [,b]) => b - a);

    if (sortedAgents.length === 0) {
      EdgeLogger.error('No available agents found!');
      return 'flow_agent'; // Fallback
    }

    let finalSelection = sortedAgents[0][0];

    // Conflict resolution for close scores (within 3 points)
    if (sortedAgents.length >= 2) {
      const [winner, runnerUp] = sortedAgents;
      const scoreDifference = winner[1] - runnerUp[1];
      
      if (scoreDifference <= 3) {
        // Apply hierarchy-based tie-breaking
        const priorityOrder = ['off_topic', 'participant_request', 'policy_expertise', 'deliberation_process', 'general'];
        const winnerPriority = priorityOrder.indexOf(intentAnalysis.primary);
        
        // Special cases for close scores
        if (intentAnalysis.primary === 'participant_request' && runnerUp[0] === 'peer_agent') {
          finalSelection = 'peer_agent';
          EdgeLogger.info(`Conflict resolution: participant request tie-breaker selected peer_agent`);
        } else if (intentAnalysis.primary === 'policy_expertise' && runnerUp[0] === 'bill_agent') {
          finalSelection = 'bill_agent';
          EdgeLogger.info(`Conflict resolution: policy expertise tie-breaker selected bill_agent`);
        } else if (intentAnalysis.primary === 'off_topic' && runnerUp[0] === 'flow_agent') {
          finalSelection = 'flow_agent';
          EdgeLogger.info(`Conflict resolution: off-topic tie-breaker selected flow_agent`);
        }
      }
    }

    EdgeLogger.info(`Agent selection results:`, {
      scores: finalScores,
      selected: finalSelection,
      primaryIntent: intentAnalysis.primary,
      confidence: intentAnalysis.confidence,
      ibisNodeCount,
      engagementPattern: engagementMetrics.interactionPattern
    });

    return finalSelection;
  }

  // System prompt generation with sophisticated template integration
  async generateSystemPrompt(agentConfig: AgentConfig | null, agentType: string, context?: any): Promise<string> {
    EdgeLogger.info('Generating system prompt', {
      agentType,
      hasAgentConfig: !!agentConfig,
      hasPromptOverride: !!agentConfig?.prompt_overrides?.system_prompt,
      agentConfigId: agentConfig?.id,
      agentName: agentConfig?.name
    });

    // PRIORITY 1: Use agent config prompt_overrides if available (this should be primary)
    if (agentConfig?.prompt_overrides?.system_prompt) {
      EdgeLogger.info('Using prompt_overrides.system_prompt', {
        agentType,
        agentId: agentConfig.id,
        promptLength: agentConfig.prompt_overrides.system_prompt.length
      });
      return this.enhancePromptWithContext(agentConfig.prompt_overrides.system_prompt, agentType, {
        ...context,
        agentConfig
      });
    }

    // PRIORITY 2: Try to get a sophisticated prompt template from the database
    const templatePrompt = await this.getPromptTemplate(agentType, context?.deliberationId);
    
    if (templatePrompt) {
      EdgeLogger.info('Using database template', {
        agentType,
        templateLength: templatePrompt.length,
        deliberationId: context?.deliberationId
      });
      return this.enhancePromptWithContext(templatePrompt, agentType, {
        ...context,
        agentConfig
      });
    }

    // PRIORITY 3: Try PromptTemplateService for agent default prompts
    const promptService = new PromptTemplateService(this.supabase);
    
    const fallbackPrompts: Record<string, string> = {
      'bill_agent': 'You are a policy analysis agent. Provide clear, factual analysis of legislation and policy matters.',
      'peer_agent': 'You are a peer perspective agent. Share relevant viewpoints and arguments from the discussion.',
      'flow_agent': 'You are a conversation facilitation agent. Help guide productive discussion and engagement.'
    };
    
    const fallbackPrompt = fallbackPrompts[agentType] || 'You are a helpful deliberation assistant.';
    
    try {
      const { prompt: templatePrompt, isTemplate, templateUsed } = await promptService.generatePrompt(
        `agent_default_${agentType}`,
        {
          agent_type: agentType,
          agent_name: agentConfig?.name || agentType,
          response_style: agentConfig?.response_style || 'professional',
          goals: agentConfig?.goals?.join(', ') || 'assist users'
        },
        fallbackPrompt
      );

      EdgeLogger.info(isTemplate ? 'Using agent template from database' : 'Using hardcoded fallback', {
        agentType,
        templateUsed,
        agentConfigId: agentConfig?.id
      });

      return this.enhancePromptWithContext(templatePrompt, agentType, {
        ...context,
        agentConfig
      });
      
    } catch (error) {
      EdgeLogger.error('Failed to get agent template, using hardcoded fallback', error);
      return this.enhancePromptWithContext(fallbackPrompt, agentType, {
        ...context,
        agentConfig
      });
    }
  }

  // Fetch sophisticated prompt template from database
  private async getPromptTemplate(agentType: string, deliberationId?: string): Promise<string | null> {
    try {
      EdgeLogger.debug('Fetching prompt template', { agentType, deliberationId });

      // Try different naming patterns for templates
      const templateNamePatterns = [
        `agent_default_${agentType}`,  // e.g., "agent_default_bill_agent"
        `${agentType}_default`,        // e.g., "bill_agent_default"
        `default_${agentType}`,        // e.g., "default_bill_agent"
        agentType                      // e.g., "bill_agent"
      ];

      // First try to get a deliberation-specific template
      if (deliberationId) {
        for (const pattern of templateNamePatterns) {
          const { data: localTemplate, error: localError } = await this.supabase
            .from('prompt_templates')
            .select('template_text, variables, name')
            .eq('category', 'system_prompt')
            .eq('name', pattern)
            .eq('deliberation_id', deliberationId)
            .eq('is_active', true)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!localError && localTemplate) {
            EdgeLogger.info('Found local template', { 
              pattern, 
              templateName: localTemplate.name,
              agentType,
              deliberationId 
            });
            return this.processTemplate(localTemplate.template_text, localTemplate.variables, deliberationId);
          }
        }
      }

      // Fallback to global template
      for (const pattern of templateNamePatterns) {
        const { data: globalTemplate, error: globalError } = await this.supabase
          .from('prompt_templates')
          .select('template_text, variables, name')
          .eq('category', 'system_prompt')
          .eq('name', pattern)
          .is('deliberation_id', null)
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!globalError && globalTemplate) {
          EdgeLogger.info('Found global template', { 
            pattern, 
            templateName: globalTemplate.name,
            agentType 
          });
          return this.processTemplate(globalTemplate.template_text, globalTemplate.variables, deliberationId);
        }
      }

      EdgeLogger.debug('No prompt template found for any pattern', { 
        agentType, 
        deliberationId,
        patternsChecked: templateNamePatterns 
      });
      return null;
    } catch (error) {
      EdgeLogger.warn('Failed to fetch prompt template', { 
        error: error.message, 
        agentType, 
        deliberationId 
      });
      return null;
    }
  }

  // Process template with variable substitution
  private processTemplate(templateText: string, variables: any, deliberationId?: string): string {
    if (!variables || typeof variables !== 'object') {
      return templateText;
    }

    let processedTemplate = templateText;
    
    // Replace common variables
    const replacements: Record<string, string> = {
      '{deliberation_id}': deliberationId || 'current deliberation',
      '{timestamp}': new Date().toISOString(),
      '{date}': new Date().toLocaleDateString(),
      '{time}': new Date().toLocaleTimeString()
    };

    // Add any custom variables from the template
    if (variables.custom) {
      Object.entries(variables.custom).forEach(([key, value]) => {
        replacements[`{${key}}`] = String(value);
      });
    }

    // Apply all replacements
    Object.entries(replacements).forEach(([placeholder, value]) => {
      processedTemplate = processedTemplate.replace(new RegExp(placeholder, 'g'), value);
    });

    return processedTemplate;
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
          
          // Add relationship information
          if (node.outgoing_relationships?.length > 0) {
            prompt += `\n   Outgoing relationships:`;
            node.outgoing_relationships.forEach((rel: any) => {
              prompt += `\n     • ${rel.type} "${rel.target_title}" (${rel.target_type})`;
            });
          }
          if (node.incoming_relationships?.length > 0) {
            prompt += `\n   Incoming relationships:`;
            node.incoming_relationships.forEach((rel: any) => {
              prompt += `\n     • "${rel.source_title}" (${rel.source_type}) ${rel.type} this`;
            });
          }
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

  // IBIS Node Retrieval for Peer Agent with Relationships
  private async fetchIBISNodes(deliberationId: string): Promise<any[]> {
    try {
      EdgeLogger.debug('Fetching IBIS nodes with relationships for peer agent', { deliberationId });
      
      // First fetch the nodes
      const { data: ibisNodes, error } = await this.supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type, created_at, position_x, position_y')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(15); // Limit to most recent 15 nodes for performance

      if (error) {
        EdgeLogger.warn('Failed to fetch IBIS nodes', { error: error.message, deliberationId });
        return [];
      }

      if (!ibisNodes || ibisNodes.length === 0) {
        EdgeLogger.info('No IBIS nodes found', { deliberationId });
        return [];
      }

      // Fetch relationships for these nodes
      const nodeIds = ibisNodes.map(node => node.id);
      const { data: relationships, error: relError } = await this.supabase
        .from('ibis_relationships')
        .select(`
          id, 
          relationship_type, 
          source_node_id, 
          target_node_id,
          source_node:ibis_nodes!ibis_relationships_source_node_id_fkey(title, node_type),
          target_node:ibis_nodes!ibis_relationships_target_node_id_fkey(title, node_type)
        `)
        .eq('deliberation_id', deliberationId)
        .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`);

      if (relError) {
        EdgeLogger.warn('Failed to fetch IBIS relationships', { error: relError.message });
        // Continue without relationships rather than failing completely
      }

      // Enhance nodes with their relationships
      const nodesWithRelationships = ibisNodes.map(node => {
        const sourceRels = relationships?.filter(rel => rel.source_node_id === node.id) || [];
        const targetRels = relationships?.filter(rel => rel.target_node_id === node.id) || [];
        
        return {
          ...node,
          outgoing_relationships: sourceRels.map(rel => ({
            type: rel.relationship_type,
            target_title: rel.target_node?.title || 'Unknown',
            target_type: rel.target_node?.node_type || 'unknown'
          })),
          incoming_relationships: targetRels.map(rel => ({
            type: rel.relationship_type,
            source_title: rel.source_node?.title || 'Unknown', 
            source_type: rel.source_node?.node_type || 'unknown'
          }))
        };
      });

      EdgeLogger.info('IBIS nodes with relationships fetched successfully', { 
        nodeCount: nodesWithRelationships.length,
        relationshipCount: relationships?.length || 0,
        deliberationId 
      });
      
      return nodesWithRelationships;
    } catch (error) {
      EdgeLogger.error('Error fetching IBIS nodes with relationships', { error: error.message, deliberationId });
      return [];
    }
  }

  // Knowledge Query for Bill Agent  
  private async queryAgentKnowledge(agentId: string, query: string): Promise<string | null> {
    try {
      EdgeLogger.debug('Querying agent knowledge', { agentId, queryLength: query.length });
      
      const { data, error } = await this.supabase
        .functions
        .invoke('knowledge_query', {
          body: {
            query,
            agent_id: agentId,
            match_threshold: 0.3,
            match_count: 5
          }
        });

      if (error) {
        EdgeLogger.warn('Knowledge query failed', { error: error.message, agentId });
        return null;
      }

      if (data?.success && data?.response) {
        EdgeLogger.info('Knowledge query successful', { 
          agentId, 
          responseLength: data.response.length 
        });
        return data.response;
      }

      EdgeLogger.debug('No knowledge found for query', { agentId });
      return null;
    } catch (error) {
      EdgeLogger.error('Error querying agent knowledge', { error: error.message, agentId });
      return null;
    }
  }

  // Model selection with circuit breaker respect
  selectOptimalModel(analysis: AnalysisResult, agentConfig?: AgentConfig): string {
    // Check circuit breaker state for model selection consistency
    if (this.circuitBreaker) {
      // Use conservative model selection when circuit breaker has issues
      return agentConfig?.preferred_model || 'gpt-4o-mini';
    }
    
    if (agentConfig?.preferred_model) {
      return agentConfig.preferred_model;
    }
    return 'gpt-4o-mini';
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

function buildOpenAIParams(model: string, messages: any[], agentType: string) {
  // All models now use standard parameters
  const base: any = {
    model,
    messages
  };

  const maxTokens = agentType === 'bill_agent' ? 1000 : 800;

  EdgeLogger.debug('Building OpenAI params for orchestration', {
    model,
    maxTokens,
    agentType,
    messageCount: messages.length
  });

  // gpt-4o-mini uses standard OpenAI parameters
  base.max_tokens = maxTokens;
  base.temperature = 0.7;
  EdgeLogger.debug('Using standard model parameters (orchestration)', { max_tokens: maxTokens, temperature: 0.7 });

  return base;
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
      message: rawMessage, 
      messageId, 
      deliberationId,
      conversationContext = {},
      mode = 'chat',
      debug = false
    } = requestBody;

    let message = rawMessage;

    // If message is missing but messageId is provided, fetch the message content
    if ((!message || message.trim().length === 0) && messageId) {
      const { data: msg, error } = await serviceClient
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
      deliberationId,
      undefined,
      mode
    );
    EdgeLogger.info('Agent selected', { selectedAgentType });

    // Get agent configuration (fresh fetch in debug mode to bypass cache)
    let agentConfig: any = null;
    let debugInfo: any = undefined;

    if (debug) {
      const { data: localAgent } = await serviceClient
        .from('agent_configurations')
        .select('id, name, description, agent_type, goals, response_style, is_active, is_default, deliberation_id, prompt_overrides, facilitator_config, preferred_model')
        .eq('deliberation_id', deliberationId)
        .eq('agent_type', selectedAgentType)
        .eq('is_active', true)
        .maybeSingle();

      const { data: globalAgent } = await serviceClient
        .from('agent_configurations')
        .select('id, name, description, agent_type, goals, response_style, is_active, is_default, deliberation_id, prompt_overrides, facilitator_config, preferred_model')
        .eq('agent_type', selectedAgentType)
        .eq('is_default', true)
        .is('deliberation_id', null)
        .eq('is_active', true)
        .maybeSingle();

      const usedSource = localAgent ? 'local' : 'global';
      agentConfig = localAgent || globalAgent;

      if (!agentConfig) {
        return createErrorResponse(
          new Error(`No active configuration found for agent type: ${selectedAgentType}`),
          404,
          'Agent configuration'
        );
      }

      debugInfo = {
        deliberationId,
        selectedAgentType,
        localAgent: localAgent ? { id: localAgent.id, name: localAgent.name } : null,
        globalAgent: globalAgent ? { id: globalAgent.id, name: globalAgent.name } : null,
        usedAgentSource: usedSource
      };
    } else {
      const fetched = await orchestrator.getAgentConfig(selectedAgentType, deliberationId);
      if (!fetched) {
        return createErrorResponse(
          new Error(`No active configuration found for agent type: ${selectedAgentType}`),
          404,
          'Agent configuration'
        );
      }
      agentConfig = fetched;
    }

    // Fetch agent-specific knowledge context
    let knowledgeContext: any = {};
    
    // For peer_agent: fetch IBIS nodes  
    if (selectedAgentType === 'peer_agent') {
      const similarNodes = await orchestrator.fetchIBISNodes(deliberationId);
      knowledgeContext.similarNodes = similarNodes;
      EdgeLogger.info('IBIS context added for peer agent', { 
        nodeCount: similarNodes.length 
      });
    }
    
    // For bill_agent: query agent knowledge
    if (selectedAgentType === 'bill_agent' && agentConfig?.id) {
      const agentKnowledge = await orchestrator.queryAgentKnowledge(agentConfig.id, message);
      if (agentKnowledge) {
        knowledgeContext.knowledgeContext = agentKnowledge;
        EdgeLogger.info('Knowledge context added for bill agent', {
          agentId: agentConfig.id,
          contextLength: agentKnowledge.length
        });
      }
    }
    
    // For flow_agent: explicitly no additional knowledge (prompt-only)
    if (selectedAgentType === 'flow_agent') {
      EdgeLogger.info('Flow agent - using prompt-only approach');
      // No additional knowledge context added
    }

    // Generate sophisticated system prompt with agent-specific context
    const systemPrompt = await orchestrator.generateSystemPrompt(agentConfig, selectedAgentType, {
      analysis,
      conversationContext,
      deliberationId,
      ...knowledgeContext
    });

    // Enrich debug info with prompt/template details
    if (debug) {
      let templateSource: 'local' | 'global' | 'none' = 'none';
      // Check for deliberation-specific template
      const { data: localTemplate } = await serviceClient
        .from('prompt_templates')
        .select('id')
        .eq('category', 'system_prompt')
        .ilike('name', `%${selectedAgentType}%`)
        .eq('deliberation_id', deliberationId)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (localTemplate) {
        templateSource = 'local';
      } else {
        const { data: globalTemplate } = await serviceClient
          .from('prompt_templates')
          .select('id')
          .eq('category', 'system_prompt')
          .ilike('name', `%${selectedAgentType}%`)
          .is('deliberation_id', null)
          .eq('is_active', true)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (globalTemplate) templateSource = 'global';
      }

      debugInfo = {
        ...debugInfo,
        promptOverrideUsed: Boolean(agentConfig?.prompt_overrides?.system_prompt),
        templateSource,
        systemPromptPreview: systemPrompt ? String(systemPrompt).slice(0, 400) : ''
      };
    }

    // Select optimal model
    const selectedModel = orchestrator.selectOptimalModel(analysis, agentConfig);

    // Prepare response with sophisticated metadata
    const response = {
      success: true,
      selectedAgent: {
        id: agentConfig.id,
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
      },
      debugInfo
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
