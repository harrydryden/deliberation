import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// ============================================================================
// SOPHISTICATED PROACTIVE PROMPT GENERATION WITH SHARED FUNCTIONALITY INLINED
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
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'proactive_prompt_generation';
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

  async recordFailure(): Promise<void> {
    try {
      const now = new Date();
      const { data: currentState } = await this.supabase
        .from('circuit_breaker_state')
        .select('failure_count')
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID)
        .maybeSingle();

      const newFailureCount = (currentState?.failure_count || 0) + 1;
      
      await this.supabase
        .from('circuit_breaker_state')
        .upsert({
          id: CircuitBreaker.CIRCUIT_BREAKER_ID,
          failure_count: newFailureCount,
          last_failure_time: now,
          is_open: newFailureCount >= CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD,
          updated_at: now
        }, { onConflict: 'id' });

      EdgeLogger.info(`Circuit breaker failure recorded: ${newFailureCount}/${CircuitBreaker.CIRCUIT_BREAKER_THRESHOLD}`);
    } catch (error) {
      EdgeLogger.error('Failed to record circuit breaker failure', error);
    }
  }

  async reset(): Promise<void> {
    try {
      await this.supabase
        .from('circuit_breaker_state')
        .update({
          failure_count: 0,
          is_open: false,
          updated_at: new Date()
        })
        .eq('id', CircuitBreaker.CIRCUIT_BREAKER_ID);
      EdgeLogger.info('Circuit breaker RESET');
    } catch (error) {
      EdgeLogger.error('Failed to reset circuit breaker', error);
    }
  }
}

// ============================================================================
// ENHANCED PROACTIVE PROMPT GENERATION SERVICE
// ============================================================================

class ProactivePromptGenerationService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private openaiApiKey: string;
  private promptService: PromptTemplateService;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
    this.promptService = new PromptTemplateService(supabase);
  }

  async generateProactivePrompt(
    deliberationId: string, 
    context: string = '', 
    agentType: string = 'flow_agent',
    userId?: string,
    sessionContext?: any
  ): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback proactive prompt');
      return this.generateFallbackPrompt(context, agentType);
    }

    try {
      EdgeLogger.info('Starting proactive prompt generation', {
        deliberationId,
        agentType,
        contextLength: context.length,
        userId
      });

      // Fetch deliberation details
      const { data: deliberation, error: deliberationError } = await this.supabase
        .from('deliberations')
        .select('title, description, notion, status')
        .eq('id', deliberationId)
        .single();

      if (deliberationError || !deliberation) {
        throw new Error(`Deliberation not found: ${deliberationId}`);
      }

      // Fetch recent messages
      const recentMessages = await this.fetchRecentMessages(deliberationId);

      // Fetch flow agent config if available
      const { data: agentConfig } = await this.supabase
        .from('agent_configurations')
        .select('prompt_overrides')
        .eq('agent_type', 'flow_agent')
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle();

      EdgeLogger.debug('Context data fetched', {
        recentMessagesCount: recentMessages.length,
        hasAgentConfig: !!agentConfig
      });

      // Generate proactive prompt using AI
      const prompt = await this.generateAIProactivePrompt(
        deliberation,
        context,
        agentType,
        recentMessages,
        agentConfig?.prompt_overrides?.system_prompt,
        sessionContext
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('Proactive prompt generated successfully', {
        deliberationId,
        agentType,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        prompt,
        metadata: {
          deliberationId,
          agentType,
          recentMessagesCount: recentMessages.length,
          processingTimeMs: duration,
          deliberationTitle: deliberation.title
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Proactive prompt generation failed', {
        error: error.message,
        duration,
        deliberationId,
        agentType
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message, agentType);
    }
  }

  private async fetchRecentMessages(deliberationId: string): Promise<any[]> {
    try {
      const { data: messages, error } = await this.supabase
        .from('messages')
        .select('content, created_at, message_type, user_id')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        EdgeLogger.warn('Failed to fetch recent messages', error);
        return [];
      }

      return messages || [];
    } catch (error) {
      EdgeLogger.warn('Error fetching recent messages', error);
      return [];
    }
  }

  private async generateAIProactivePrompt(
    deliberation: any,
    context: string,
    agentType: string,
    recentMessages: any[],
    flowSystemPrompt?: string,
    sessionContext?: any
  ): Promise<any> {
    // Calculate engagement metrics
    const userEngagement = recentMessages.filter(msg => msg.message_type === 'user').length;
    const lastMessageType = recentMessages[0]?.message_type || 'user';

    // Generate conversation summary
    const conversationSummary = recentMessages.length > 0 
      ? `Recent activity: ${recentMessages.slice(0, 5).map(msg => `${msg.message_type}: ${msg.content.substring(0, 50)}...`).join(' | ')}`
      : 'No recent activity';

    // Generate guidance based on activity
    const sessionPhaseGuidance = recentMessages.length > 5 
      ? 'Help synthesize viewpoints and identify areas of convergence'
      : 'Encourage reflection on earlier points and deeper exploration';

    const userExperienceGuidance = userEngagement === 0
      ? 'Provide onboarding guidance to help new participants engage'
      : 'Build on previous contributions and encourage deeper analysis';

    const engagementLevelGuidance = userEngagement > 3
      ? 'Facilitate active discussion and help maintain focus'
      : 'Encourage more participation and engagement';

    // Prepare variables for template substitution matching "generate_proactive_prompts"
    const templateVariables = {
      flow_system_prompt: flowSystemPrompt || 'You are a helpful AI facilitator guiding productive deliberation.',
      deliberation_title: deliberation.title,
      deliberation_description: deliberation.description || 'No description provided',
      deliberation_notion: deliberation.notion || 'No notion provided',
      user_engagement: userEngagement,
      last_message_type: lastMessageType,
      conversation_summary: conversationSummary,
      session_context: JSON.stringify(sessionContext || {}),
      session_phase_guidance: sessionPhaseGuidance,
      user_experience_guidance: userExperienceGuidance,
      engagement_level_guidance: engagementLevelGuidance
    };

    // Fallback prompt with matching output schema
    const fallbackSystemPrompt = `${templateVariables.flow_system_prompt}

You are facilitating a deliberation titled: "${deliberation.title}"
Description: ${deliberation.description || 'No description provided'}
Notion: ${deliberation.notion || 'No notion provided'}

Current engagement: ${userEngagement} user messages
Last message type: ${lastMessageType}
Conversation summary: ${conversationSummary}

${sessionPhaseGuidance}
${userExperienceGuidance}
${engagementLevelGuidance}

Generate a proactive prompt that will help advance this deliberation. Return a JSON object with:
{
  "question": "The proactive prompt question",
  "context": "engagement|onboarding|catch_up|perspective|extended_session"
}`;

    // Generate prompt using template service
    const { prompt: systemPrompt, isTemplate, templateUsed } = await this.promptService.generatePrompt(
      'generate_proactive_prompts',
      templateVariables,
      fallbackSystemPrompt
    );

    // Log template usage
    this.promptService.logTemplateUsage('generate_proactive_prompts', isTemplate, 'proactive_prompt');
    if (isTemplate) {
      EdgeLogger.info('Using generate_proactive_prompts template', { 
        templateUsed,
        userEngagement,
        lastMessageType,
        sessionPhaseGuidance: sessionPhaseGuidance.substring(0, 50)
      });
    } else {
      EdgeLogger.warn('Template not found, using fallback prompt');
    }

    const userPrompt = `Generate a proactive prompt for the ${agentType} agent based on the current deliberation state and context: ${context}`;

    const messages_array = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages_array,
        max_tokens: 1000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const result = JSON.parse(content);
      
      if (!result.question) {
        throw new Error('No question generated');
      }

      EdgeLogger.debug('AI proactive prompt generated', {
        questionLength: result.question.length,
        context: result.context
      });

      // Return the expected format for useEnhancedProactivePrompts
      return {
        question: result.question,
        context: result.context || 'engagement'
      };

    } catch (parseError) {
      EdgeLogger.error('Failed to parse AI proactive prompt', {
        error: parseError.message,
        content: content.substring(0, 200)
      });
      throw new Error('Invalid response format from AI');
    }
  }

  private generateFallbackPrompt(context: string, agentType: string): any {
    EdgeLogger.info('Generating fallback proactive prompt', { agentType, contextLength: context.length });
    
    const fallbackPrompts = {
      facilitator_agent: {
        question: "What key questions should we explore to advance this deliberation?",
        context: "engagement"
      },
      bill_agent: {
        question: "What policy considerations are most important for this topic?",
        context: "perspective"
      },
      peer_agent: {
        question: "What perspectives and experiences should we consider?",
        context: "perspective"
      },
      flow_agent: {
        question: "How can we structure this discussion to be most productive?",
        context: "engagement"
      }
    };

    const prompt = fallbackPrompts[agentType] || {
      question: "How can we move this deliberation forward productively?",
      context: "engagement"
    };

    return {
      success: true,
      prompt,
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        agentType
      }
    };
  }

  private generateErrorResponse(errorMessage: string, agentType: string): any {
    return {
      success: false,
      prompt: {
        question: "Unable to generate proactive prompt at this time.",
        context: "engagement"
      },
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        reason: 'Generation failed',
        agentType
      }
    };
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

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  const requestId = crypto.randomUUID().slice(0, 8);
  
  EdgeLogger.debug('Parsing proactive prompt request', { requestId, requiredFields });
  
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    EdgeLogger.debug('Request validation successful', { requestId });
    return body as T;
  } catch (error: any) {
    EdgeLogger.error('Request parsing failed', { requestId, error: error.message });
    throw new Error(`Request parsing failed: ${error.message}`);
  }
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
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiApiKey) missing.push('OPENAI_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    openaiApiKey
  };
}

// ============================================================================
// INTERFACES
// ============================================================================

interface ProactivePromptRequest {
  deliberationId: string;
  context?: string;
  agentType?: string;
  userId?: string;
  sessionContext?: any;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCORSPreflight(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  try {
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();
    
    const body = await parseAndValidateRequest<ProactivePromptRequest>(
      req, 
      ['deliberationId']
    );

    // Handle both input schemas
    const context = body.context || '';
    const agentType = body.agentType || 'flow_agent';
    const userId = body.userId;
    const sessionContext = body.sessionContext;

    EdgeLogger.info('Proactive prompt request received', {
      deliberationId: body.deliberationId,
      agentType,
      contextLength: context.length,
      hasUserId: !!userId,
      hasSessionContext: !!sessionContext
    });

    const service = new ProactivePromptGenerationService(supabase, openaiApiKey);
    const result = await service.generateProactivePrompt(
      body.deliberationId,
      context,
      agentType,
      userId,
      sessionContext
    );

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Edge function error', { error: error.message });
    return createErrorResponse(error, 500, 'Proactive Prompt Generation');
  }
});