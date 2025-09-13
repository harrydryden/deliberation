import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";

// ============================================================================
// SOPHISTICATED RELATIONSHIP EVALUATION WITH SHARED FUNCTIONALITY INLINED
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
    );
  }

  static info(message: string, data?: any): void {
    );
  }

  static warn(message: string, data?: any): void {
    );
  }

  static error(message: string, data?: any): void {
    );
  }
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private static readonly CIRCUIT_BREAKER_ID = 'relationship_evaluation';
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
// ENHANCED RELATIONSHIP EVALUATION SERVICE
// ============================================================================

class RelationshipEvaluationService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private openaiApiKey: string;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.openaiApiKey = openaiApiKey;
    this.circuitBreaker = new CircuitBreaker(supabase);
  }

  async evaluateRelationships(
    deliberationId: string,
    content: string,
    title: string,
    nodeType: string,
    includeAllTypes: boolean = false
  ): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - using fallback relationship evaluation');
      return this.generateFallbackRelationships(content, title, nodeType);
    }

    try {
      EdgeLogger.info('Starting relationship evaluation', {
        deliberationId,
        nodeType,
        titleLength: title.length,
        contentLength: content.length,
        includeAllTypes
      });

      // Fetch existing IBIS nodes for comparison
      const { data: existingNodes, error: nodesError } = await this.supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type, created_at')
        .eq('deliberation_id', deliberationId)
        .order('created_at', { ascending: false });

      if (nodesError) {
        throw new Error(`Failed to fetch existing nodes: ${nodesError.message}`);
      }

      if (!existingNodes || existingNodes.length === 0) {
        EdgeLogger.info('No existing nodes found for relationship evaluation', { deliberationId });
        return this.generateEmptyRelationships();
      }

      EdgeLogger.debug('Existing nodes fetched for relationship evaluation', {
        count: existingNodes.length,
        deliberationId
      });

      // Evaluate relationships using AI
      const relationships = await this.evaluateRelationshipsWithAI(
        content,
        title,
        nodeType,
        existingNodes,
        includeAllTypes
      );

      const duration = Date.now() - startTime;
      EdgeLogger.info('Relationship evaluation completed successfully', {
        deliberationId,
        relationshipsFound: relationships.length,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        relationships,
        metadata: {
          deliberationId,
          nodeType,
          existingNodesCount: existingNodes.length,
          relationshipsFound: relationships.length,
          processingTimeMs: duration
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Relationship evaluation failed', {
        error: error.message,
        duration,
        deliberationId,
        nodeType
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private async evaluateRelationshipsWithAI(
    content: string,
    title: string,
    nodeType: string,
    existingNodes: any[],
    includeAllTypes: boolean
  ): Promise<any[]> {
    const systemPrompt = `You are an expert analyst evaluating relationships between IBIS (Issue-Based Information System) nodes in a deliberation.

Analyze the provided content and identify relationships with existing nodes. Consider:
1. Conceptual similarity and thematic connections
2. Logical dependencies (supports, challenges, elaborates)
3. Temporal relationships (builds on, responds to)
4. Hierarchical relationships (parent-child, sibling)
5. Argumentative relationships (evidence, counter-argument)

Node Types:
- issue: Questions or problems to be addressed
- position: Stances or viewpoints on issues
- argument: Evidence, reasoning, or support for positions

Return a JSON array of relationship objects with this structure:
[
  {
    "targetNodeId": "node_id",
    "targetNodeTitle": "Node Title",
    "relationshipType": "supports|challenges|elaborates|builds_on|responds_to|evidence|counter_argument|similar|parent|child|sibling",
    "strength": 0.0-1.0,
    "reasoning": "Brief explanation of the relationship",
    "confidence": 0.0-1.0
  }
]`;

    const nodeContext = existingNodes.map(node => 
      `ID: ${node.id}\nTitle: ${node.title}\nType: ${node.node_type}\nDescription: ${node.description || 'No description'}\n---`
    ).join('\n');

    const userPrompt = `Content to analyze:
Title: ${title}
Type: ${nodeType}
Content: ${content}

Existing nodes in deliberation:
${nodeContext}

${includeAllTypes ? 'Include relationships with all node types.' : `Focus on relationships with ${nodeType} nodes primarily.`}

Identify the most relevant relationships (limit to top 5).`;

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
        max_tokens: 1500,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content_response = data.choices?.[0]?.message?.content;
    
    if (!content_response) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const result = JSON.parse(content_response);
      
      if (!Array.isArray(result)) {
        throw new Error('Response is not an array');
      }

      // Validate and filter relationships
      const validRelationships = result
        .filter(rel => rel.targetNodeId && rel.relationshipType && rel.strength !== undefined)
        .filter(rel => existingNodes.some(node => node.id === rel.targetNodeId))
        .map(rel => ({
          targetNodeId: rel.targetNodeId,
          targetNodeTitle: rel.targetNodeTitle || 'Unknown',
          relationshipType: rel.relationshipType,
          strength: Math.max(0, Math.min(1, rel.strength || 0.5)),
          reasoning: rel.reasoning || 'AI-generated relationship',
          confidence: Math.max(0, Math.min(1, rel.confidence || 0.7))
        }))
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5);

      EdgeLogger.debug('AI relationship evaluation completed', {
        requested: 5,
        generated: result.length,
        valid: validRelationships.length
      });

      return validRelationships;

    } catch (parseError) {
      EdgeLogger.error('Failed to parse AI relationship evaluation', {
        error: parseError.message,
        content: content_response.substring(0, 200)
      });
      throw new Error('Invalid response format from AI');
    }
  }

  private generateFallbackRelationships(content: string, title: string, nodeType: string): any {
    EdgeLogger.info('Generating fallback relationship evaluation', {
      nodeType,
      titleLength: title.length,
      contentLength: content.length
    });
    
    return {
      success: true,
      relationships: [],
      metadata: {
        source: 'fallback',
        processingTimeMs: 0,
        relationshipsFound: 0,
        reason: 'Circuit breaker open'
      }
    };
  }

  private generateEmptyRelationships(): any {
    EdgeLogger.info('Generating empty relationships - no existing nodes');
    
    return {
      success: true,
      relationships: [],
      metadata: {
        source: 'empty',
        processingTimeMs: 0,
        relationshipsFound: 0,
        reason: 'No existing nodes'
      }
    };
  }

  private generateErrorResponse(errorMessage: string): any {
    return {
      success: false,
      relationships: [],
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        relationshipsFound: 0,
        reason: 'Evaluation failed'
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
  
  EdgeLogger.debug('Parsing relationship evaluation request', { requestId, requiredFields });
  
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

interface RelationshipRequest {
  deliberationId: string;
  content: string;
  title: string;
  nodeType: string;
  includeAllTypes?: boolean;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('Relationship evaluation function called', { 
      method: req.method, 
      url: req.url 
    });

    const { deliberationId, content, title, nodeType, includeAllTypes = false }: RelationshipRequest = await parseAndValidateRequest(req, ['deliberationId', 'content', 'title', 'nodeType']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing relationship evaluation request', {
      deliberationId,
      nodeType,
      titleLength: title.length,
      contentLength: content.length,
      includeAllTypes
    });

    // Create relationship evaluation service
    const relationshipService = new RelationshipEvaluationService(supabase, openaiApiKey);
    
    // Evaluate relationships
    const result = await relationshipService.evaluateRelationships(
      deliberationId,
      content,
      title,
      nodeType,
      includeAllTypes
    );

    EdgeLogger.info('Relationship evaluation completed', {
      success: result.success,
      relationshipsFound: result.relationships?.length || 0
    });

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('Relationship evaluation error', error);
    return createErrorResponse(error, 500, 'relationship evaluation');
  }
});