import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

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

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async generateProactivePrompt(deliberationId: string, context: string, agentType: string): Promise<any> {
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

      // Fetch recent activity and IBIS nodes
      const [recentMessages, ibisNodes] = await Promise.all([
        this.fetchRecentMessages(deliberationId),
        this.fetchIBISNodes(deliberationId)
      ]);

      EdgeLogger.debug('Context data fetched', {
        recentMessagesCount: recentMessages.length,
        ibisNodesCount: ibisNodes.length
      });

      // Generate proactive prompt using AI
      const prompt = await this.generateAIProactivePrompt(
        deliberation,
        context,
        agentType,
        recentMessages,
        ibisNodes
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('Proactive prompt generated successfully', {
        deliberationId,
        agentType,
        promptLength: prompt.length,
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
          ibisNodesCount: ibisNodes.length,
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
      
      return this.generateErrorResponse(error.message);
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

  private async fetchIBISNodes(deliberationId: string): Promise<any[]> {
    try {
      const { data: nodes, error } = await this.supabase
        .from('ibis_nodes')
        .select('title, description, node_type, created_at')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        EdgeLogger.warn('Failed to fetch IBIS nodes', error);
        return [];
      }

      return nodes || [];
    } catch (error) {
      EdgeLogger.warn('Error fetching IBIS nodes', error);
      return [];
    }
  }

  private async generateAIProactivePrompt(
    deliberation: any,
    context: string,
    agentType: string,
    recentMessages: any[],
    ibisNodes: any[]
  ): Promise<string> {
    const systemPrompt = `You are an expert facilitator helping to generate proactive prompts for AI agents in deliberation discussions.

Deliberation: "${deliberation.title}"
Description: ${deliberation.description || 'No description provided'}
Notion: ${deliberation.notion || 'No notion provided'}
Agent Type: ${agentType}

Generate a proactive prompt that will help the ${agentType} agent engage meaningfully with the deliberation. The prompt should:
1. Be contextually relevant to the current deliberation state
2. Encourage productive discussion and participation
3. Be appropriate for the agent's role and capabilities
4. Consider recent activity and discussion patterns
5. Be engaging and thought-provoking
6. Be concise but comprehensive

Return a JSON object with this structure:
{
  "prompt": "The proactive prompt text",
  "reasoning": "Brief explanation of why this prompt is appropriate",
  "suggestedActions": ["action1", "action2", "action3"],
  "priority": "high|medium|low"
}`;

    const recentActivity = recentMessages.length > 0 ? 
      `Recent Messages:\n${recentMessages.slice(0, 5).map(msg => `- [${msg.created_at}] ${msg.content}`).join('\n')}` : 
      'No recent messages';

    const ibisContext = ibisNodes.length > 0 ?
      `Current IBIS Discussion Points:\n${ibisNodes.slice(0, 10).map(node => `- ${node.title} (${node.node_type})`).join('\n')}` :
      'No IBIS discussion points yet';

    const userPrompt = `Context: ${context}

${recentActivity}

${ibisContext}

Generate a proactive prompt for the ${agentType} agent that will help advance this deliberation.`;

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
      
      if (!result.prompt) {
        throw new Error('No prompt generated');
      }

      EdgeLogger.debug('AI proactive prompt generated', {
        promptLength: result.prompt.length,
        priority: result.priority,
        suggestedActions: result.suggestedActions?.length || 0
      });

      return result.prompt;

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
      facilitator_agent: "What key questions should we explore to advance this deliberation?",
      bill_agent: "What policy considerations are most important for this topic?",
      peer_agent: "What perspectives and experiences should we consider?",
      flow_agent: "How can we structure this discussion to be most productive?"
    };

    const prompt = fallbackPrompts[agentType] || "How can we move this deliberation forward productively?";

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

  private generateErrorResponse(errorMessage: string): any {
    return {
      success: false,
      prompt: "Unable to generate proactive prompt at this time.",
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
  context: string;
  agentType: string;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('Proactive prompt generation function called', { 
      method: req.method, 
      url: req.url 
    });

    const { deliberationId, context, agentType }: ProactivePromptRequest = await parseAndValidateRequest(req, ['deliberationId', 'context', 'agentType']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing proactive prompt generation request', {
      deliberationId,
      agentType,
      contextLength: context.length
    });

    // Create proactive prompt generation service
    const promptService = new ProactivePromptGenerationService(supabase, openaiApiKey);
    
    // Generate proactive prompt
    const result = await promptService.generateProactivePrompt(deliberationId, context, agentType);

    EdgeLogger.info('Proactive prompt generation completed', {
      success: result.success,
      promptLength: result.prompt?.length || 0
    });

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Proactive prompt generation error', error);
    return createErrorResponse(error, 500, 'proactive prompt generation');
  }
});