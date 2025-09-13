import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// SOPHISTICATED ISSUE RECOMMENDATIONS WITH SHARED FUNCTIONALITY INLINED
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
  private static readonly CIRCUIT_BREAKER_ID = 'issue_recommendations';
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
// ENHANCED ISSUE RECOMMENDATIONS SERVICE
// ============================================================================

class IssueRecommendationsService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private openaiApiKey: string;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async generateRecommendations(deliberationId: string, context: string, maxRecommendations: number = 5): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback recommendations');
      return this.generateFallbackRecommendations(context);
    }

    try {
      EdgeLogger.info('Starting issue recommendations generation', {
        deliberationId,
        contextLength: context.length,
        maxRecommendations
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

      // Fetch existing IBIS nodes to avoid duplicates
      const { data: existingNodes, error: nodesError } = await this.supabase
        .from('ibis_nodes')
        .select('title, description, node_type')
        .eq('deliberation_id', deliberationId);

      if (nodesError) {
        EdgeLogger.warn('Failed to fetch existing nodes', nodesError);
      }

      const existingTitles = (existingNodes || []).map(node => node.title.toLowerCase());
      EdgeLogger.debug('Existing nodes fetched', { count: existingTitles.length });

      // Generate recommendations using AI
      const recommendations = await this.generateAIRecommendations(
        deliberation,
        context,
        existingTitles,
        maxRecommendations
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('Issue recommendations generated successfully', {
        count: recommendations.length,
        duration,
        deliberationTitle: deliberation.title
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        recommendations,
        metadata: {
          deliberationId,
          deliberationTitle: deliberation.title,
          existingNodesCount: existingTitles.length,
          processingTimeMs: duration,
          generatedCount: recommendations.length
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Issue recommendations generation failed', {
        error: error.message,
        duration,
        deliberationId
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private async generateAIRecommendations(
    deliberation: any,
    context: string,
    existingTitles: string[],
    maxRecommendations: number
  ): Promise<any[]> {
    const systemPrompt = `You are an expert facilitator helping to identify key issues for deliberation.

Deliberation: "${deliberation.title}"
Description: ${deliberation.description || 'No description provided'}
Notion: ${deliberation.notion || 'No notion provided'}

Context: ${context}

Generate ${maxRecommendations} specific, actionable issues that would be valuable to discuss in this deliberation. Each issue should:
1. Be directly relevant to the deliberation topic
2. Be specific and actionable (not too broad or vague)
3. Represent a genuine question or problem that needs discussion
4. Be distinct from existing issues (avoid duplicates)
5. Be appropriate for the deliberation's current stage

Existing issues to avoid duplicating:
${existingTitles.map(title => `- ${title}`).join('\n')}

Return a JSON array of issue objects with this structure:
[
  {
    "title": "Specific, actionable issue title",
    "description": "Brief description of why this issue matters",
    "priority": "high|medium|low",
    "category": "policy|process|stakeholder|technical|other",
    "reasoning": "Why this issue is important for this deliberation"
  }
]`;

    const userPrompt = `Based on the deliberation context and the specific situation described, generate ${maxRecommendations} relevant issues for discussion.`;

    const messages = [
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
        model: 'gpt-5-2025-08-07',
        messages,
        max_tokens: 2000,
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
      const recommendations = JSON.parse(content);
      
      if (!Array.isArray(recommendations)) {
        throw new Error('Response is not an array');
      }

      // Validate and filter recommendations
      const validRecommendations = recommendations
        .filter(rec => rec.title && rec.description)
        .filter(rec => !existingTitles.includes(rec.title.toLowerCase()))
        .slice(0, maxRecommendations)
        .map(rec => ({
          title: rec.title,
          description: rec.description,
          priority: rec.priority || 'medium',
          category: rec.category || 'other',
          reasoning: rec.reasoning || 'Generated by AI analysis',
          source: 'ai_generated',
          confidence: 0.8
        }));

      EdgeLogger.debug('AI recommendations processed', {
        requested: maxRecommendations,
        generated: recommendations.length,
        valid: validRecommendations.length
      });

      return validRecommendations;

    } catch (parseError) {
      EdgeLogger.error('Failed to parse AI recommendations', {
        error: parseError.message,
        content: content.substring(0, 200)
      });
      throw new Error('Invalid response format from AI');
    }
  }

  private generateFallbackRecommendations(context: string): any {
    EdgeLogger.info('Generating fallback recommendations', { contextLength: context.length });
    
    const fallbackRecommendations = [
      {
        title: "What are the key challenges in this area?",
        description: "Identify the main obstacles or difficulties that need to be addressed",
        priority: "high",
        category: "process",
        reasoning: "Understanding challenges is fundamental to effective deliberation",
        source: "fallback",
        confidence: 0.6
      },
      {
        title: "What are the potential solutions or approaches?",
        description: "Explore different ways to address the identified challenges",
        priority: "high",
        category: "policy",
        reasoning: "Solution exploration is essential for productive deliberation",
        source: "fallback",
        confidence: 0.6
      },
      {
        title: "What are the implications of different approaches?",
        description: "Consider the consequences and trade-offs of various options",
        priority: "medium",
        category: "stakeholder",
        reasoning: "Understanding implications helps make informed decisions",
        source: "fallback",
        confidence: 0.6
      }
    ];

    return {
      success: true,
      recommendations: fallbackRecommendations,
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        generatedCount: fallbackRecommendations.length
      }
    };
  }

  private generateErrorResponse(errorMessage: string) {
    return {
      success: false,
      recommendations: [],
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        generatedCount: 0,
        reason: 'Generation failed'
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
  
  EdgeLogger.debug('Parsing issue recommendations request', { requestId, requiredFields });
  
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

interface IssueRecommendationsRequest {
  deliberationId: string;
  context: string;
  maxRecommendations?: number;
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
    EdgeLogger.info('Issue recommendations function called', { 
      method: req.method, 
      url: req.url 
    });

    const { deliberationId, context, maxRecommendations = 5 }: IssueRecommendationsRequest = await parseAndValidateRequest(req, ['deliberationId', 'context']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing issue recommendations request', {
      deliberationId,
      contextLength: context.length,
      maxRecommendations
    });

    // Create issue recommendations service
    const recommendationsService = new IssueRecommendationsService(supabase, openaiApiKey);
    
    // Generate recommendations
    const result = await recommendationsService.generateRecommendations(deliberationId, context, maxRecommendations);

    EdgeLogger.info('Issue recommendations completed', {
      success: result.success,
      count: result.recommendations?.length || 0
    });

    const response = {
      ...result,
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

  } catch (error) {
    EdgeLogger.error('Issue recommendations error', error);
    
    // Add metadata to error response
    const errorResponse = createErrorResponse(error, 500, 'issue recommendations');
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
