import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// ============================================================================
// SOPHISTICATED USER STANCE CALCULATION WITH SHARED FUNCTIONALITY INLINED
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
    console.log(this.formatMessage('WARN', message, data));
  }

  static error(message: string, data?: any): void {
    console.log(this.formatMessage('ERROR', message, data));
  }
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'user_stance_calculation';
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
// ENHANCED USER STANCE CALCULATION SERVICE
// ============================================================================

class UserStanceCalculationService {
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

  async calculateUserStance(userId: string, deliberationId: string): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback stance calculation');
      return this.generateFallbackStance(userId, deliberationId);
    }

    try {
      EdgeLogger.info('Starting user stance calculation', {
        userId,
        deliberationId
      });

      // Fetch user messages for this deliberation
      const { data: messages, error: messagesError } = await this.supabase
        .from('messages')
        .select('content, created_at, message_type')
        .eq('user_id', userId)
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        throw new Error(`Failed to fetch user messages: ${messagesError.message}`);
      }

      if (!messages || messages.length === 0) {
        EdgeLogger.warn('No messages found for user', { userId, deliberationId });
        return this.generateEmptyStance(userId, deliberationId);
      }

      EdgeLogger.debug('User messages fetched', {
        count: messages.length,
        userId,
        deliberationId
      });

      // Fetch deliberation context
      const { data: deliberation, error: deliberationError } = await this.supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single();

      if (deliberationError || !deliberation) {
        throw new Error(`Deliberation not found: ${deliberationId}`);
      }

      // Calculate stance using AI analysis
      const stanceResult = await this.calculateStanceWithAI(
        messages,
        deliberation,
        userId,
        deliberationId
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('User stance calculation completed successfully', {
        userId,
        deliberationId,
        messagesAnalyzed: messages.length,
        duration,
        stanceScore: stanceResult.stanceScore
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        userId,
        deliberationId,
        stanceScore: stanceResult.stanceScore,
        confidence: stanceResult.confidence,
        analysis: stanceResult.analysis,
        keyThemes: stanceResult.keyThemes,
        sentimentTrend: stanceResult.sentimentTrend,
        positionStrength: stanceResult.positionStrength,
        messageCount: messages.length,
        metadata: {
          processingTimeMs: duration,
          messagesAnalyzed: messages.length,
          deliberationTitle: deliberation.title
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('User stance calculation failed', {
        error: error.message,
        duration,
        userId,
        deliberationId
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message, userId, deliberationId);
    }
  }

  private async calculateStanceWithAI(
    messages: any[],
    deliberation: any,
    userId: string,
    deliberationId: string
  ): Promise<any> {
    // Prepare variables for template substitution matching "stance_calculation_system_prompt"
    const templateVariables = {
      deliberation_title: deliberation.title,
      deliberation_description: deliberation.description || 'No description provided',
      user_messages_count: messages.length.toString()
    };

    // Fallback prompt (original hardcoded version)
    const fallbackSystemPrompt = `You are an expert analyst tasked with calculating a user's stance on a deliberation topic.

Deliberation: "${deliberation.title}"
Description: ${deliberation.description || 'No description provided'}
Notion: ${deliberation.notion || 'No notion provided'}

Analyze the user's messages to determine their overall stance. Consider:
1. The sentiment and tone of their messages
2. The positions they take on key issues
3. The consistency of their views across messages
4. The strength of their convictions
5. Any changes in position over time

Return a JSON object with this structure:
{
  "stanceScore": 0.0-1.0,
  "confidence": 0.0-1.0,
  "analysis": "Brief explanation of the stance calculation",
  "keyThemes": ["theme1", "theme2", "theme3"],
  "sentimentTrend": "positive|negative|neutral|mixed",
  "positionStrength": "strong|moderate|weak"
}`;

    // Generate prompt using template service
    const { prompt: systemPrompt, isTemplate, templateUsed } = await this.promptService.generatePrompt(
      'stance_calculation_system_prompt',
      templateVariables,
      fallbackSystemPrompt
    );

    // Log template usage
    this.promptService.logTemplateUsage('stance_calculation_system_prompt', isTemplate, 'user_stance');
    if (isTemplate) {
      EdgeLogger.info('Using stance_calculation_system_prompt template', { 
        templateUsed,
        userId,
        deliberationId,
        messageCount: messages.length
      });
    } else {
      EdgeLogger.warn('Template not found, using fallback prompt');
    }

    const userPrompt = `Analyze these ${messages.length} messages from a user in the deliberation:

${messages.map((msg, index) => `${index + 1}. [${msg.created_at}] ${msg.content}`).join('\n\n')}

Calculate their overall stance on the deliberation topic.`;

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
      
      // Validate and normalize the result
      const stanceScore = Math.max(0, Math.min(1, result.stanceScore || 0.5));
      const confidence = Math.max(0, Math.min(1, result.confidence || 0.7));
      
      EdgeLogger.debug('AI stance analysis completed', {
        stanceScore,
        confidence,
        keyThemes: result.keyThemes?.length || 0,
        sentimentTrend: result.sentimentTrend,
        positionStrength: result.positionStrength
      });

      return {
        stanceScore: Math.round(stanceScore * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        analysis: result.analysis || 'AI analysis completed',
        keyThemes: result.keyThemes || [],
        sentimentTrend: result.sentimentTrend || 'neutral',
        positionStrength: result.positionStrength || 'moderate'
      };

    } catch (parseError) {
      EdgeLogger.error('Failed to parse AI stance analysis', {
        error: parseError.message,
        content: content.substring(0, 200)
      });
      throw new Error('Invalid response format from AI');
    }
  }

  private generateFallbackStance(userId: string, deliberationId: string): any {
    EdgeLogger.info('Generating fallback stance calculation', { userId, deliberationId });
    
    return {
      success: true,
      userId,
      deliberationId,
      stanceScore: 0.5,
      confidence: 0.3,
      analysis: "Fallback calculation - insufficient data for accurate analysis",
      keyThemes: [],
      sentimentTrend: "neutral",
      positionStrength: "moderate",
      messageCount: 0,
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        reason: 'Circuit breaker open'
      }
    };
  }

  private generateEmptyStance(userId: string, deliberationId: string): any {
    EdgeLogger.info('Generating empty stance for user with no messages', { userId, deliberationId });
    
    return {
      success: true,
      userId,
      deliberationId,
      stanceScore: 0.5,
      confidence: 0.0,
      analysis: "No messages found - neutral stance assumed",
      keyThemes: [],
      sentimentTrend: "neutral",
      positionStrength: "unknown",
      messageCount: 0,
      metadata: {
        source: 'empty',
        processingTimeMs: 0,
        reason: 'No user messages'
      }
    };
  }

  private generateErrorResponse(errorMessage: string, userId: string, deliberationId: string): any {
    return {
      success: false,
      userId,
      deliberationId,
      stanceScore: 0.5,
      confidence: 0.0,
      analysis: "Error occurred during calculation",
      keyThemes: [],
      sentimentTrend: "neutral",
      positionStrength: "unknown",
      error: errorMessage,
      messageCount: 0,
      metadata: {
        processingTimeMs: 0,
        reason: 'Calculation failed'
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
  
  EdgeLogger.debug('Parsing user stance calculation request', { requestId, requiredFields });
  
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

interface UserStanceRequest {
  userId: string;
  deliberationId: string;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCORSPreflight(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  try {
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();
    
    const body = await parseAndValidateRequest<UserStanceRequest>(
      req, 
      ['userId', 'deliberationId']
    );

    EdgeLogger.info('User stance calculation request received', {
      userId: body.userId,
      deliberationId: body.deliberationId
    });

    const service = new UserStanceCalculationService(supabase, openaiApiKey);
    const result = await service.calculateUserStance(
      body.userId,
      body.deliberationId
    );

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Edge function error', { error: error.message });
    return createErrorResponse(error, 500, 'User Stance Calculation');
  }
});