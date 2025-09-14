import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { OpenAIEmbeddings } from "https://esm.sh/@langchain/openai@0.6.3";

// ============================================================================
// SOPHISTICATED IBIS EMBEDDINGS WITH SHARED FUNCTIONALITY INLINED
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
  private static readonly CIRCUIT_BREAKER_ID = 'ibis_embeddings';
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
// ENHANCED IBIS EMBEDDINGS SERVICE
// ============================================================================

class IBISEmbeddingsService {
  private circuitBreaker: CircuitBreaker;
  private supabase: any;
  private embeddings: OpenAIEmbeddings;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.circuitBreaker = new CircuitBreaker(supabase);
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small',
      maxRetries: 2,
      timeout: 10000
    });
  }

  async computeEmbeddings(deliberationId?: string, nodeId?: string, nodeType?: string, force: boolean = false): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - skipping embedding computation');
      return this.generateEmptyResponse('Circuit breaker open');
    }

    try {
      EdgeLogger.info('Starting IBIS embeddings computation', {
        deliberationId,
        nodeId,
        nodeType,
        force
      });

      // Build query based on parameters
      let query = this.supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type, deliberation_id, embedding');

      if (nodeId) {
        query = query.eq('id', nodeId);
      } else if (deliberationId) {
        query = query.eq('deliberation_id', deliberationId);
      }

      if (nodeType) {
        query = query.eq('node_type', nodeType);
      }

      // If not forcing, only get nodes without embeddings
      if (!force) {
        query = query.is('embedding', null);
      }

      const { data: nodes, error: nodesError } = await query;

      if (nodesError) {
        throw new Error(`Failed to fetch IBIS nodes: ${nodesError.message}`);
      }

      if (!nodes || nodes.length === 0) {
        EdgeLogger.info('No nodes found for embedding computation', {
          deliberationId,
          nodeId,
          nodeType,
          force
        });
        return this.generateEmptyResponse('No nodes found');
      }

      EdgeLogger.debug('IBIS nodes fetched for embedding', {
        count: nodes.length,
        deliberationId,
        nodeId,
        nodeType
      });

      // Process nodes in batches to avoid rate limits
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < nodes.length; i += batchSize) {
        batches.push(nodes.slice(i, i + batchSize));
      }

      let processedCount = 0;
      let errorCount = 0;

      for (const batch of batches) {
        try {
          await this.processBatch(batch);
          processedCount += batch.length;
          
          EdgeLogger.debug('Batch processed successfully', {
            batchSize: batch.length,
            totalProcessed: processedCount
          });
          
          // Small delay between batches to avoid rate limits
          if (batches.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          errorCount += batch.length;
          EdgeLogger.error('Batch processing failed', {
            error: error.message,
            batchSize: batch.length
          });
        }
      }

      const duration = Date.now() - startTime;
      EdgeLogger.info('IBIS embeddings computation completed', {
        totalNodes: nodes.length,
        processedCount,
        errorCount,
        duration
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        totalNodes: nodes.length,
        processedCount,
        errorCount,
        metadata: {
          processingTimeMs: duration,
          deliberationId,
          nodeId,
          nodeType,
          force
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('IBIS embeddings computation failed', {
        error: error.message,
        duration,
        deliberationId,
        nodeId
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private async processBatch(nodes: any[]): Promise<void> {
    // Prepare texts for embedding
    const texts = nodes.map(node => {
      const title = node.title || '';
      const description = node.description || '';
      return `${title}\n\n${description}`.trim();
    });

    // Generate embeddings
    const embeddings = await this.embeddings.embedDocuments(texts);

    // Update nodes with embeddings
    const updatePromises = nodes.map((node, index) => {
      const embedding = embeddings[index];
      if (!embedding || embedding.length === 0) {
        EdgeLogger.warn('Empty embedding generated for node', { nodeId: node.id });
        return Promise.resolve();
      }

      return this.supabase
        .from('ibis_nodes')
        .update({ 
          embedding: embedding,
          updated_at: new Date().toISOString()
        })
        .eq('id', node.id);
    });

    const results = await Promise.allSettled(updatePromises);
    
    const failedUpdates = results.filter(result => result.status === 'rejected');
    if (failedUpdates.length > 0) {
      EdgeLogger.warn('Some embedding updates failed', {
        failedCount: failedUpdates.length,
        totalCount: nodes.length
      });
    }

    EdgeLogger.debug('Batch embeddings updated', {
      successCount: results.length - failedUpdates.length,
      failedCount: failedUpdates.length
    });
  }

  private generateEmptyResponse(reason: string): any {
    return {
      success: true,
      totalNodes: 0,
      processedCount: 0,
      errorCount: 0,
      reason,
      metadata: {
        processingTimeMs: 0
      }
    };
  }

  private generateErrorResponse(errorMessage: string): any {
    return {
      success: false,
      totalNodes: 0,
      processedCount: 0,
      errorCount: 0,
      error: errorMessage,
      metadata: {
        processingTimeMs: 0,
        reason: 'Computation failed'
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
  
  EdgeLogger.debug('Parsing IBIS embeddings request', { requestId, requiredFields });
  
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

interface EmbeddingRequest {
  deliberationId?: string;
  nodeId?: string;
  nodeType?: string;
  force?: boolean;
}

// ============================================================================
// MAIN EDGE FUNCTION
// ============================================================================

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    EdgeLogger.info('IBIS embeddings function called', { 
      method: req.method, 
      url: req.url 
    });

    const { deliberationId, nodeId, nodeType, force = false }: EmbeddingRequest = await parseAndValidateRequest(req, []);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing IBIS embeddings request', {
      deliberationId,
      nodeId,
      nodeType,
      force
    });

    // Create IBIS embeddings service
    const embeddingsService = new IBISEmbeddingsService(supabase, openaiApiKey);
    
    // Compute embeddings
    const result = await embeddingsService.computeEmbeddings(deliberationId, nodeId, nodeType, force);

    EdgeLogger.info('IBIS embeddings computation completed', {
      success: result.success,
      totalNodes: result.totalNodes,
      processedCount: result.processedCount
    });

    return createSuccessResponse(result);

  } catch (error) {
    EdgeLogger.error('IBIS embeddings error', error);
    return createErrorResponse(error, 500, 'IBIS embeddings');
  }
});