import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

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
  private promptService: PromptTemplateService;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
    this.promptService = new PromptTemplateService(supabase);
  }

  async generateRecommendations(deliberationId: string, userContent: string, maxRecommendations: number = 5): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback recommendations');
      return this.generateFallbackRecommendations(userContent, maxRecommendations);
    }

    try {
      EdgeLogger.info('Starting issue recommendations generation', {
        deliberationId,
        userContentLength: userContent.length,
        maxRecommendations
      });

      // Fetch existing issues with id, title, description
      const { data: existingIssues, error: issuesError } = await this.supabase
        .from('ibis_nodes')
        .select('id, title, description')
        .eq('deliberation_id', deliberationId)
        .eq('node_type', 'issue');

      if (issuesError) {
        EdgeLogger.warn('Failed to fetch existing issues', issuesError);
      }

      const issues = existingIssues || [];
      EdgeLogger.debug('Existing issues fetched', { count: issues.length });

      // Format existing issues for template
      const existingIssuesFormatted = issues.length > 0 
        ? issues.map(issue => `${issue.id} | ${issue.title}: ${issue.description || ''}`).join('\n')
        : 'No existing issues';

      // Generate recommendations using AI
      const recommendations = await this.generateAIRecommendations(
        userContent,
        existingIssuesFormatted,
        maxRecommendations,
        issues
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('Issue recommendations generated successfully', {
        count: recommendations.length,
        duration,
        deliberationId
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        recommendations,
        metadata: {
          deliberationId,
          existingIssuesCount: issues.length,
          processingTimeMs: duration,
          generatedCount: recommendations.length
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.warn('Issue recommendations generation failed, returning fallback', {
        error: error.message,
        duration,
        deliberationId
      });

      // Only record circuit breaker failure for true API errors
      if (!error.message.includes('aborted') && !error.message.includes('timeout')) {
        await this.circuitBreaker.recordFailure();
      }
      
      return {
        success: true,
        recommendations: [],
        metadata: {
          deliberationId,
          source: 'fallback_after_error',
          processingTimeMs: duration,
          generatedCount: 0,
          reason: error.message
        }
      };
    }
  }

  private async generateAIRecommendations(
    userContent: string,
    existingIssues: string,
    maxRecommendations: number,
    issuesData: any[]
  ): Promise<any[]> {
    // Prepare variables for template substitution matching "Issue Recommendation System"
    const templateVariables = {
      user_content: userContent,
      existing_issues: existingIssues,
      max_recommendations: maxRecommendations
    };

    // Fallback prompt (original hardcoded version)
    const fallbackSystemPrompt = `You are an expert facilitator helping to identify key issues for deliberation based on user input.

User Content: ${userContent}

Existing Issues:
${existingIssues}

Generate ${maxRecommendations} specific, actionable issues that would be valuable to discuss. Each issue should:
1. Be directly relevant to the user's input
2. Be specific and actionable (not too broad or vague)
3. Represent a genuine question or problem that needs discussion
4. Be distinct from existing issues (avoid duplicates)
5. Have a relevance score of at least 0.6

Return a JSON array of issue objects with this structure:
[
  {
    "issueId": "<uuid>",
    "relevanceScore": 0.85,
    "explanation": "Why this issue is important and relevant"
  }
]

Only include issues with relevance scores >= 0.6. Validate that issueId corresponds to an existing issue from the list above.`;

    // Generate prompt using template service
    const { prompt: systemPrompt, isTemplate, templateUsed } = await this.promptService.generatePrompt(
      'Issue Recommendation System',
      templateVariables,
      fallbackSystemPrompt
    );

    // Log template usage and missing variables
    this.promptService.logTemplateUsage('Issue Recommendation System', isTemplate, 'issue_recommendations');
    if (isTemplate) {
      EdgeLogger.info('Using Issue Recommendation System template', { templateUsed });
    } else {
      EdgeLogger.warn('Template not found, using fallback prompt');
    }

    const userPrompt = `Generate ${maxRecommendations} relevant issue recommendations based on the provided context.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    // Remove response_format to allow JSON array response
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 2000,
        temperature: 0.7
      }),
    });
    
    clearTimeout(timeoutId);

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
      let aiRecommendations = [];
      
      // Try to parse as JSON array first
      try {
        aiRecommendations = JSON.parse(content);
      } catch {
        // If that fails, try to extract array from response
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          aiRecommendations = JSON.parse(arrayMatch[0]);
        } else {
          EdgeLogger.warn('Could not extract JSON array from response', { content: content.substring(0, 200) });
          return [];
        }
      }

      if (!Array.isArray(aiRecommendations)) {
        EdgeLogger.warn('AI response is not an array', { content: content.substring(0, 200) });
        return [];
      }

      // Filter by relevance threshold and enrich with issue data
      const validRecommendations = aiRecommendations
        .filter(rec => rec.relevanceScore >= 0.6)
        .map(rec => {
          // Find matching issue data
          const issueData = issuesData.find(issue => issue.id === rec.issueId);
          if (issueData) {
            return {
              issueId: rec.issueId,
              title: issueData.title,
              description: issueData.description,
              relevanceScore: rec.relevanceScore,
              explanation: rec.explanation
            };
          }
          return null;
        })
        .filter(rec => rec !== null)
        .slice(0, maxRecommendations);

      EdgeLogger.debug('AI recommendations processed', {
        requested: maxRecommendations,
        generated: aiRecommendations.length,
        valid: validRecommendations.length,
        threshold: 0.6
      });

      return validRecommendations;

    } catch (parseError) {
      EdgeLogger.warn('Failed to parse AI recommendations, returning empty results', {
        error: parseError.message,
        content: content.substring(0, 200)
      });
      return [];
    }
  }

  private generateFallbackRecommendations(userContent: string, maxRecommendations: number): any {
    EdgeLogger.info('Generating fallback recommendations', { userContentLength: userContent.length, maxRecommendations });
    
    const fallbackRecommendations = [
      {
        issueId: `fallback_${Date.now()}_1`,
        title: "What are the key challenges in this area?",
        description: "Identify the main obstacles or difficulties that need to be addressed",
        relevanceScore: 0.6,
        explanation: "Understanding challenges is fundamental to effective deliberation"
      },
      {
        issueId: `fallback_${Date.now()}_2`,
        title: "What are the potential solutions or approaches?", 
        description: "Explore different ways to address the identified challenges",
        relevanceScore: 0.6,
        explanation: "Solution exploration is essential for productive deliberation"
      }
    ].slice(0, maxRecommendations);

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

interface IssueRecommendationRequest {
  deliberationId: string;
  context?: string;        // Support legacy "context" field
  userContent?: string;    // Support new "userContent" field
  maxRecommendations?: number;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCORSPreflight(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  try {
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();
    
    const body = await parseAndValidateRequest<IssueRecommendationRequest>(
      req, 
      ['deliberationId']
    );

    // Normalize input: accept both "context" and "userContent"
    const userContent = body.userContent || body.context || '';
    const maxRecommendations = body.maxRecommendations || 5;

    EdgeLogger.info('Issue recommendations request received', {
      deliberationId: body.deliberationId,
      userContentLength: userContent.length,
      maxRecommendations
    });

    const service = new IssueRecommendationsService(supabase, openaiApiKey);
    const result = await service.generateRecommendations(
      body.deliberationId,
      userContent,
      maxRecommendations
    );

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Edge function error', { error: error.message });
    return createErrorResponse(error, 500, 'Issue Recommendations Generation');
  }
});