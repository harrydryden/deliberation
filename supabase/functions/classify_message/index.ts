import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// ============================================================================
// SOPHISTICATED MESSAGE CLASSIFICATION WITH SHARED FUNCTIONALITY INLINED
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
  private static readonly CIRCUIT_BREAKER_ID = 'message_classification';
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
// ENHANCED OPENAI CLIENT
// ============================================================================

class EnhancedOpenAIClient {
  private apiKey: string;
  private circuitBreaker: CircuitBreaker;

  constructor(apiKey: string, supabase: any) {
    this.apiKey = apiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async createChatCompletion(options: any, retryOptions: any = {}): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback classification');
      return this.generateFallbackClassification(options);
    }

    const modelName = options.model || 'gpt-4o-mini';
    const maxRetries = retryOptions.maxRetries || 2;
    const timeoutMs = retryOptions.timeoutMs || 25000;

    EdgeLogger.info('Starting OpenAI classification request', {
      model: modelName,
      maxRetries,
      messageLength: options.messages?.[1]?.content?.length || 0
    });

    let lastError: any = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        EdgeLogger.debug(`Classification attempt ${attempt + 1}/${maxRetries + 1}`, { model: modelName });
        
        const response = await this.makeAPICall(options, timeoutMs);
        
        if (response) {
          const duration = Date.now() - startTime;
          EdgeLogger.info(`Classification success in ${duration}ms`, { 
            model: modelName, 
            attempt: attempt + 1 
          });
          
          await this.circuitBreaker.reset();
          return response;
        }
      } catch (error) {
        lastError = error;
        EdgeLogger.warn(`Classification attempt ${attempt + 1} failed`, {
          error: error.message,
          model: modelName
        });
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    EdgeLogger.error('All classification attempts failed', {
      model: modelName,
      attempts: maxRetries + 1,
      lastError: lastError?.message
    });
    
    await this.circuitBreaker.recordFailure();
    return this.generateFallbackClassification(options);
  }

  private async makeAPICall(options: any, timeoutMs: number): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...options,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content || content.trim().length === 0) {
        throw new Error('Empty response content from OpenAI');
      }

      // Validate JSON response
      try {
        JSON.parse(content);
        return data;
      } catch (parseError) {
        throw new Error(`Invalid JSON response from OpenAI: ${content.substring(0, 100)}`);
      }

    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  private generateFallbackClassification(options: any): any {
    const userMessage = options.messages?.[1]?.content || '';
    
    EdgeLogger.info('Generating fallback classification', { contentLength: userMessage.length });
    
    // Simple keyword-based classification
    const keywords = {
      issue: /\b(problem|issue|concern|challenge|difficulty|obstacle|barrier|question|what|how|why)\b/gi,
      position: /\b(agree|disagree|support|oppose|believe|think|opinion|view|stance|position)\b/gi,
      argument: /\b(because|since|therefore|however|but|although|evidence|proof|reason|argument)\b/gi
    };

    const matches = Object.entries(keywords).reduce((acc, [type, pattern]) => {
      acc[type] = (userMessage.match(pattern) || []).length;
      return acc;
    }, {} as Record<string, number>);

    const maxMatches = Math.max(...Object.values(matches));
    const nodeType = maxMatches > 0 ? 
      Object.entries(matches).find(([_, count]) => count === maxMatches)?.[0] || 'issue' : 
      'issue';

    const stanceScore = nodeType === 'position' ? 
      Math.min(0.8, 0.3 + (matches.position * 0.1)) : 0.5;

    const fallbackResult = {
      title: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''),
      keywords: userMessage.split(/\s+/).slice(0, 5),
      nodeType,
      confidence: 0.6,
      description: `Fallback classification based on keyword analysis`,
      stanceScore: Math.round(stanceScore * 100) / 100
    };

    EdgeLogger.info('Fallback classification generated', fallbackResult);
    
    return {
      choices: [{
        message: {
          content: JSON.stringify(fallbackResult)
        }
      }]
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
  
  EdgeLogger.debug('Parsing request body', { requestId, requiredFields });
  
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

async function getClassificationTemplates(
  promptService: PromptTemplateService, 
  content: string, 
  deliberationContext: string, 
  deliberationNotion: string
): Promise<{ systemMessage: string, userPrompt: string }> {
  try {
    EdgeLogger.info('Fetching classification templates using PromptTemplateService');
    
    // Variables for template substitution
    const templateVariables = {
      content,
      deliberationContext,
      deliberationNotion
    };

    // Fallback prompts (original hardcoded versions)
    const fallbackSystemPrompt = `You are an expert deliberation facilitator analyzing user messages for an IBIS (Issue-Based Information System) structured dialogue.

Your task is to classify user messages into IBIS node types and provide structured analysis for the deliberation interface.

Classification Guidelines:
1. **Issue**: Questions, problems, concerns, or topics that need to be addressed
2. **Position**: Stances, viewpoints, opinions, or proposed solutions
3. **Argument**: Evidence, reasoning, justification, or support/opposition for positions

Consider the deliberation context and be precise in your classification.

Return a valid JSON object with this exact structure:
{
  "title": "Short descriptive title (max 100 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "nodeType": "issue|position|argument",
  "confidence": 0.0-1.0,
  "description": "Brief explanation of the classification reasoning",
  "stanceScore": 0.0-1.0
}`;

    const fallbackUserPrompt = `Analyze this message for IBIS classification:

${deliberationContext}

${deliberationNotion ? `Deliberation Notion: ${deliberationNotion}` : ''}

Message to analyze: "${content}"

Classify this message and provide the requested JSON structure.`;

    // Get templates using the service
    const { prompt: systemMessage, isTemplate: systemIsTemplate } = await promptService.generatePrompt(
      'classification_system_message',
      templateVariables,
      fallbackSystemPrompt
    );

    const { prompt: userPrompt, isTemplate: userIsTemplate } = await promptService.generatePrompt(
      'classification_prompt',
      templateVariables,
      fallbackUserPrompt
    );

    // Log template usage
    promptService.logTemplateUsage('classification_system_message', systemIsTemplate, 'message_classification');
    promptService.logTemplateUsage('classification_prompt', userIsTemplate, 'message_classification');

    EdgeLogger.info('Classification templates retrieved successfully', {
      systemTemplateUsed: systemIsTemplate,
      userTemplateUsed: userIsTemplate
    });

    return {
      systemMessage,
      userPrompt
    };
  } catch (error) {
    EdgeLogger.error('Failed to fetch classification templates', error);
    throw new Error('Classification templates not available');
  }
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  // Track processing time for metadata
  const startTime = Date.now();

  try {
    EdgeLogger.info('Message classification function called', { 
      method: req.method, 
      url: req.url 
    });

    const { content, deliberationId } = await parseAndValidateRequest(req, ['content', 'deliberationId']);
    const { supabase } = await validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();
    const promptService = new PromptTemplateService(supabase);

    EdgeLogger.info('Processing classification request', {
      contentLength: content?.length || 0,
      deliberationId: deliberationId || 'none',
      hasContent: !!content && content.trim().length > 0
    });

    // Validate content is not empty
    if (!content || content.trim().length === 0) {
      EdgeLogger.warn('Empty or missing content provided for classification');
      throw new Error('Message content is required for classification');
    }

    // Fetch deliberation context
    let deliberationContext = '';
    let deliberationNotion = '';
    let hasExistingNodes = true;
    
    if (deliberationId) {
      try {
        const [deliberationResponse, nodesResponse] = await Promise.all([
          supabase
            .from('deliberations')
            .select('title, description, notion')
            .eq('id', deliberationId)
            .maybeSingle(),
          supabase
            .from('ibis_nodes')
            .select('id')
            .eq('deliberation_id', deliberationId)
            .limit(1)
        ]);
        
        hasExistingNodes = nodesResponse.data && nodesResponse.data.length > 0;
        
        if (deliberationResponse.data) {
          deliberationContext = `\n\nDeliberation: "${deliberationResponse.data.title}"\nDescription: ${deliberationResponse.data.description || 'No description provided'}`;
          deliberationNotion = deliberationResponse.data.notion || '';
        }
        
        EdgeLogger.debug('Deliberation context fetched', {
          hasContext: !!deliberationResponse.data,
          hasExistingNodes,
          notionLength: deliberationNotion.length
        });
      } catch (error) {
        EdgeLogger.warn('Failed to fetch deliberation context', error);
      }
    }

    // Get classification templates using PromptTemplateService
    const { systemMessage, userPrompt } = await getClassificationTemplates(
      promptService, 
      content, 
      deliberationContext, 
      deliberationNotion
    );

    // Create enhanced OpenAI client
    const openAIClient = new EnhancedOpenAIClient(openAIApiKey, supabase);
    
    // Perform classification
    const data = await openAIClient.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.7
    }, {
      timeoutMs: 45000,
      maxRetries: 2
    });

    const result = data.choices[0].message.content;

    try {
      const parsedResult = JSON.parse(result);
      
      // Validate required fields
      const requiredFields = ['title', 'keywords', 'nodeType', 'confidence', 'description', 'stanceScore'];
      const missingFields = requiredFields.filter(field => !(field in parsedResult));
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in classification result: ${missingFields.join(', ')}`);
      }
      
      // Normalize values
      if (parsedResult.stanceScore < 0 || parsedResult.stanceScore > 1) {
        parsedResult.stanceScore = Math.max(0, Math.min(1, parsedResult.stanceScore));
      }
      
      if (parsedResult.confidence < 0 || parsedResult.confidence > 1) {
        parsedResult.confidence = Math.max(0, Math.min(1, parsedResult.confidence));
      }
      
      EdgeLogger.info('Classification completed successfully', {
        nodeType: parsedResult.nodeType,
        confidence: parsedResult.confidence,
        stanceScore: parsedResult.stanceScore,
        hasExistingNodes
      });
      
      const response = {
        ...parsedResult,
        hasExistingNodes,
        deliberationNotion,
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
            totalProcessingTime: Date.now() - startTime
          }
        },
        response_format: JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
          processingTimeMs: Date.now() - startTime
        })
      };

      return createSuccessResponse(response);
      
    } catch (parseError) {
      EdgeLogger.error('JSON parsing error', {
        error: parseError.message,
        result: result.substring(0, 200)
      });
      throw new Error('Failed to parse classification result as JSON');
    }

  } catch (error) {
    EdgeLogger.error('Classification error', error);
    
    // Add metadata to error response
    const errorResponse = createErrorResponse(error, 500, 'message classification');
    const errorData = await errorResponse.json();
    
    return createSuccessResponse({
      ...errorData,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        requestId: crypto.randomUUID(),
        version: '2.0.0',
        error: true,
        errorMessage: error.message
      },
      response_format: JSON.stringify({
        success: false,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTimeMs: Date.now() - startTime,
        error: error.message
      })
    });
  }
});
