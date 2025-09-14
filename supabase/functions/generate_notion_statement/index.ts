import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// ============================================================================
// SOPHISTICATED NOTION STATEMENT GENERATION WITH SHARED FUNCTIONALITY INLINED
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
    console.error(this.formatMessage('ERROR', message, data));
  }
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'notion_statement_generation';
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
// ENHANCED NOTION STATEMENT GENERATION SERVICE
// ============================================================================

class NotionStatementGenerationService {
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

  async generateNotionStatement(deliberationId: string, context: string, statementType: string = 'summary'): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback notion statement');
      return this.generateFallbackStatement(statementType);
    }

    try {
      EdgeLogger.info('Starting notion statement generation', {
        deliberationId,
        statementType,
        contextLength: context.length
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

      // Fetch relevant IBIS nodes for context
      const { data: ibisNodes, error: nodesError } = await this.supabase
        .from('ibis_nodes')
        .select('title, description, node_type, created_at')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (nodesError) {
        EdgeLogger.warn('Failed to fetch IBIS nodes', nodesError);
      }

      // Fetch recent messages for additional context
      const { data: recentMessages, error: messagesError } = await this.supabase
        .from('messages')
        .select('content, created_at, message_type')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (messagesError) {
        EdgeLogger.warn('Failed to fetch recent messages', messagesError);
      }

      EdgeLogger.debug('Context data fetched', {
        deliberationTitle: deliberation.title,
        ibisNodesCount: ibisNodes?.length || 0,
        recentMessagesCount: recentMessages?.length || 0
      });

      // Generate notion statement using AI
      const statement = await this.generateStatementWithAI(
        deliberation,
        context,
        statementType,
        ibisNodes || [],
        recentMessages || []
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('Notion statement generation completed successfully', {
        deliberationId,
        statementType,
        statementLength: statement.length,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        statement,
        statementType,
        metadata: {
          deliberationId,
          deliberationTitle: deliberation.title,
          ibisNodesCount: ibisNodes?.length || 0,
          recentMessagesCount: recentMessages?.length || 0,
          processingTimeMs: duration,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Notion statement generation failed', {
        error: error.message,
        duration,
        deliberationId,
        statementType
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private async generateStatementWithAI(
    deliberation: any,
    context: string,
    statementType: string,
    ibisNodes: any[],
    recentMessages: any[]
  ): Promise<string> {
    // Prepare variables for template substitution matching "generate_notion_statement"
    const templateVariables = {
      title: deliberation.title,
      description: deliberation.description || 'No description provided'
    };

    // Fallback prompt (original hardcoded version)
    const fallbackSystemPrompt = `You are an expert facilitator helping to generate notion statements for deliberation discussions.

Deliberation: "${deliberation.title}"
Description: ${deliberation.description || 'No description provided'}
Current Notion: ${deliberation.notion || 'No notion provided'}

Generate a ${statementType} notion statement that captures the essence of this deliberation. The statement should:
1. Be clear and concise (150-240 characters ideal)
2. Reflect the current state of the discussion
3. Be appropriate for the deliberation's stage
4. Incorporate key themes and insights
5. Be actionable and meaningful for participants

Statement Types:
- summary: Overall summary of the deliberation
- key_insights: Main insights and learnings
- next_steps: Recommended next steps
- consensus: Areas of agreement
- disagreements: Key areas of disagreement
- recommendations: Specific recommendations

Return only the statement text, no additional formatting.`;

    // Generate prompt using template service
    const { prompt: systemPrompt, isTemplate, templateUsed } = await this.promptService.generatePrompt(
      'generate_notion_statement',
      templateVariables,
      fallbackSystemPrompt
    );

    // Log template usage
    this.promptService.logTemplateUsage('generate_notion_statement', isTemplate, 'notion_statement');
    if (isTemplate) {
      EdgeLogger.info('Using generate_notion_statement template', { 
        templateUsed,
        title: deliberation.title,
        descriptionLength: (deliberation.description || '').length
      });
    } else {
      EdgeLogger.warn('Template not found, using fallback prompt');
    }

    const ibisContext = ibisNodes.length > 0 ? 
      `Key Discussion Points:\n${ibisNodes.slice(0, 10).map(node => `- ${node.title} (${node.node_type})`).join('\n')}` : 
      'No discussion points yet';

    const messagesContext = recentMessages.length > 0 ?
      `Recent Messages:\n${recentMessages.slice(0, 5).map(msg => `- [${msg.created_at}] ${msg.content}`).join('\n')}` :
      'No recent messages';

    const userPrompt = `Context: ${context}

${ibisContext}

${messagesContext}

Generate a ${statementType} notion statement for this deliberation.`;

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
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const statement = data.choices?.[0]?.message?.content;
    
    if (!statement || statement.trim().length === 0) {
      throw new Error('Empty statement generated');
    }

    EdgeLogger.debug('AI notion statement generated', {
      statementType,
      statementLength: statement.length,
      withinIdealRange: statement.length >= 150 && statement.length <= 240
    });

    return statement.trim();
  }

  private generateFallbackStatement(statementType: string): any {
    EdgeLogger.info('Generating fallback notion statement', { statementType });
    
    const fallbackStatements = {
      summary: "This deliberation is ongoing and requires further discussion to reach meaningful conclusions.",
      key_insights: "Key insights are still emerging as participants engage with the topic.",
      next_steps: "Continue the discussion to identify concrete next steps and actionable outcomes.",
      consensus: "Consensus is still being developed through ongoing dialogue.",
      disagreements: "Areas of disagreement are being explored to better understand different perspectives.",
      recommendations: "Recommendations will be developed as the deliberation progresses."
    };

    const statement = fallbackStatements[statementType] || fallbackStatements.summary;

    return {
      success: true,
      statement,
      statementType,
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        reason: 'Circuit breaker open'
      }
    };
  }

  private generateErrorResponse(errorMessage: string): any {
    return {
      success: false,
      statement: "",
      statementType: 'unknown',
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
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
  
  EdgeLogger.debug('Parsing notion statement request', { requestId, requiredFields });
  
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

interface NotionStatementRequest {
  deliberationId: string;
  context: string;
  statementType?: string;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCORSPreflight(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  try {
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();
    
    const body = await parseAndValidateRequest<NotionStatementRequest>(
      req, 
      ['deliberationId', 'context']
    );

    const statementType = body.statementType || 'summary';

    EdgeLogger.info('Notion statement request received', {
      deliberationId: body.deliberationId,
      contextLength: body.context.length,
      statementType
    });

    const service = new NotionStatementGenerationService(supabase, openaiApiKey);
    const result = await service.generateNotionStatement(
      body.deliberationId,
      body.context,
      statementType
    );

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Edge function error', { error: error.message });
    return createErrorResponse(error, 500, 'Notion Statement Generation');
  }
});