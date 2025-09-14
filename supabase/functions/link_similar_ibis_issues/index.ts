import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// ============================================================================
// SOPHISTICATED IBIS ISSUE LINKING WITH SHARED FUNCTIONALITY INLINED
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
  private static readonly CIRCUIT_BREAKER_ID = 'ibis_issue_linking';
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
// ENHANCED IBIS ISSUE LINKING SERVICE
// ============================================================================

class IBISIssueLinkingService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private openaiApiKey: string;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async linkSimilarIssues(deliberationId: string, threshold: number = 0.7): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - skipping issue linking');
      return this.generateEmptyResponse('Circuit breaker open');
    }

    try {
      EdgeLogger.info('Starting IBIS issue linking', {
        deliberationId,
        threshold
      });

      // Fetch all issues for this deliberation
      const { data: issues, error: issuesError } = await this.supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type, created_at')
        .eq('deliberation_id', deliberationId)
        .eq('node_type', 'issue')
        .order('created_at', { ascending: true });

      if (issuesError) {
        throw new Error(`Failed to fetch issues: ${issuesError.message}`);
      }

      if (!issues || issues.length < 2) {
        EdgeLogger.info('Insufficient issues for linking', {
          deliberationId,
          issueCount: issues?.length || 0
        });
        return this.generateEmptyResponse('Insufficient issues');
      }

      EdgeLogger.debug('Issues fetched for linking', {
        count: issues.length,
        deliberationId
      });

      // Find similar issues using AI
      const similarPairs = await this.findSimilarIssuesWithAI(issues, threshold);

      // Create relationships in database
      const relationshipsCreated = await this.createRelationships(similarPairs);

      const duration = Date.now() - startTime;
      EdgeLogger.info('IBIS issue linking completed successfully', {
        deliberationId,
        issuesAnalyzed: issues.length,
        similarPairsFound: similarPairs.length,
        relationshipsCreated,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        issuesAnalyzed: issues.length,
        similarPairsFound: similarPairs.length,
        relationshipsCreated,
        similarPairs: similarPairs.slice(0, 10), // Return top 10 for response
        metadata: {
          deliberationId,
          threshold,
          processingTimeMs: duration
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('IBIS issue linking failed', {
        error: error.message,
        duration,
        deliberationId
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private async findSimilarIssuesWithAI(issues: any[], threshold: number): Promise<any[]> {
    const promptService = new PromptTemplateService(this.supabase);
    
    // Fallback prompt (original hardcoded version)
    const fallbackSystemPrompt = `You are an expert analyst identifying similar issues in a deliberation.

Analyze the provided issues and identify pairs that are conceptually similar or related. Consider:
1. Thematic similarity (same topic area)
2. Conceptual overlap (related problems)
3. Logical connections (one builds on another)
4. Temporal relationships (sequential or parallel concerns)

Return a JSON array of similar issue pairs with this structure:`;

    // Generate prompt using template service
    const { prompt: systemPrompt, isTemplate, templateUsed } = await promptService.generatePrompt(
      'ibis_similarity_analysis_system_prompt',
      {
        similarity_threshold: threshold.toString(),
        analysis_criteria: "thematic similarity, conceptual overlap, logical connections, temporal relationships"
      },
      fallbackSystemPrompt
    );

    promptService.logTemplateUsage(
      templateUsed || 'ibis_similarity_analysis_system_prompt',
      isTemplate,
      'IBIS Similarity Analysis'
    );

    const continuedPrompt = systemPrompt + `
[
  {
    "issue1Id": "id1",
    "issue1Title": "Title 1",
    "issue2Id": "id2", 
    "issue2Title": "Title 2",
    "similarityScore": 0.0-1.0,
    "relationshipType": "similar|related|builds_on|parallel|sequential",
    "reasoning": "Brief explanation of the similarity"
  }
]

Only include pairs with similarity scores >= ${threshold}.`;

    const issuesContext = issues.map((issue, index) => 
      `${index + 1}. ID: ${issue.id}\nTitle: ${issue.title}\nDescription: ${issue.description || 'No description'}\n---`
    ).join('\n');

    const userPrompt = `Analyze these ${issues.length} issues and find similar pairs:

${issuesContext}

Identify pairs that are conceptually similar or related. Focus on meaningful connections that would be valuable for deliberation participants to understand.`;

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
        max_tokens: 2000,
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
      
      if (!Array.isArray(result)) {
        throw new Error('Response is not an array');
      }

      // Validate and filter similar pairs
      const validPairs = result
        .filter(pair => pair.issue1Id && pair.issue2Id && pair.similarityScore >= threshold)
        .filter(pair => issues.some(issue => issue.id === pair.issue1Id) && issues.some(issue => issue.id === pair.issue2Id))
        .map(pair => ({
          issue1Id: pair.issue1Id,
          issue1Title: pair.issue1Title || 'Unknown',
          issue2Id: pair.issue2Id,
          issue2Title: pair.issue2Title || 'Unknown',
          similarityScore: Math.max(0, Math.min(1, pair.similarityScore || 0.5)),
          relationshipType: pair.relationshipType || 'similar',
          reasoning: pair.reasoning || 'AI-generated similarity'
        }))
        .sort((a, b) => b.similarityScore - a.similarityScore);

      EdgeLogger.debug('AI similarity analysis completed', {
        requested: 'similar pairs',
        generated: result.length,
        valid: validPairs.length,
        threshold
      });

      return validPairs;

    } catch (parseError) {
      EdgeLogger.error('Failed to parse AI similarity analysis', {
        error: parseError.message,
        content: content.substring(0, 200)
      });
      throw new Error('Invalid response format from AI');
    }
  }

  private async createRelationships(similarPairs: any[]): Promise<number> {
    let createdCount = 0;

    for (const pair of similarPairs) {
      try {
        const { error } = await this.supabase
          .from('ibis_relationships')
          .upsert({
            source_node_id: pair.issue1Id,
            target_node_id: pair.issue2Id,
            relationship_type: pair.relationshipType,
            strength: pair.similarityScore,
            reasoning: pair.reasoning,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'source_node_id,target_node_id' });

        if (error) {
          EdgeLogger.warn('Failed to create relationship', {
            error: error.message,
            pair: `${pair.issue1Id} -> ${pair.issue2Id}`
          });
        } else {
          createdCount++;
        }
      } catch (error) {
        EdgeLogger.warn('Error creating relationship', {
          error: error.message,
          pair: `${pair.issue1Id} -> ${pair.issue2Id}`
        });
      }
    }

    EdgeLogger.debug('Relationships created', {
      requested: similarPairs.length,
      created: createdCount
    });

    return createdCount;
  }

  private generateEmptyResponse(reason: string): any {
    return {
      success: true,
      issuesAnalyzed: 0,
      similarPairsFound: 0,
      relationshipsCreated: 0,
      similarPairs: [],
      reason,
      metadata: {
        processingTimeMs: 0
      }
    };
  }

  private generateErrorResponse(errorMessage: string): any {
    return {
      success: false,
      issuesAnalyzed: 0,
      similarPairsFound: 0,
      relationshipsCreated: 0,
      similarPairs: [],
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        reason: 'Linking failed'
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
  
  EdgeLogger.debug('Parsing IBIS issue linking request', { requestId, requiredFields });
  
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

interface LinkingRequest {
  deliberationId: string;
  threshold?: number;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('IBIS issue linking function called', { 
      method: req.method, 
      url: req.url 
    });

    const { deliberationId, threshold = 0.7 }: LinkingRequest = await parseAndValidateRequest(req, ['deliberationId']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing IBIS issue linking request', {
      deliberationId,
      threshold
    });

    // Create IBIS issue linking service
    const linkingService = new IBISIssueLinkingService(supabase, openaiApiKey);
    
    // Link similar issues
    const result = await linkingService.linkSimilarIssues(deliberationId, threshold);

    EdgeLogger.info('IBIS issue linking completed', {
      success: result.success,
      similarPairsFound: result.similarPairsFound,
      relationshipsCreated: result.relationshipsCreated
    });

    return createSuccessResponse({ 
      ...result,
      response_format: JSON.stringify({
      success: true, 
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        processingTimeMs: Date.now() - startTime
      })
    });

  } catch (error) {
    EdgeLogger.error('Service error', error);
    
    // Fallback response when service fails
    const fallbackResponse = {
      success: false,
      error: 'Service temporarily unavailable',
      fallback: {
        message: 'Service is currently unavailable. Please try again later.',
        metadata: {
          processingTimeMs: Date.now() - startTime,
          requestId: crypto.randomUUID(),
          version: '2.0.0',
          fallbackReason: error.message || 'Unknown error'
        },
        response_format: JSON.stringify({
          success: false,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
          processingTimeMs: Date.now() - startTime,
          fallback: true,
          error: error.message
        })
      }
    };
    
    return createSuccessResponse(fallbackResponse);
  }
});
