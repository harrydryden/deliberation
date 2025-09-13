import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { SupabaseVectorStore } from "https://esm.sh/@langchain/community@0.3.49/vectorstores/supabase";
import { OpenAIEmbeddings, ChatOpenAI } from "https://esm.sh/@langchain/openai@0.6.3";
import { createStuffDocumentsChain } from "https://esm.sh/langchain@0.3.30/chains/combine_documents";
import { createRetrievalChain } from "https://esm.sh/langchain@0.3.30/chains/retrieval";
import { ChatPromptTemplate } from "https://esm.sh/@langchain/core@0.3.30/prompts";

// ============================================================================
// SOPHISTICATED KNOWLEDGE QUERY WITH SHARED FUNCTIONALITY INLINED
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
  private static readonly CIRCUIT_BREAKER_ID = 'knowledge_query';
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
// ENHANCED KNOWLEDGE QUERY SERVICE
// ============================================================================

class KnowledgeQueryService {
  private circuitBreaker: CircuitBreaker;
  private embeddings: OpenAIEmbeddings;
  private chatModel: ChatOpenAI;
  private supabase: any;

  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.circuitBreaker = new CircuitBreaker(supabase);
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small',
      maxRetries: 2,
      timeout: 10000
    });

    this.chatModel = new ChatOpenAI({
      openAIApiKey,
      modelName: 'gpt-4o-mini',
      maxRetries: 2,
      timeout: 15000,
      temperature: 0.1
    });
  }

  async queryKnowledge(query: string, agentId: string, maxResults: number = 5): Promise<any> {
    const startTime = Date.now();
    
    // Circuit breaker check
    if (await this.circuitBreaker.isOpen()) {
      EdgeLogger.warn('Circuit breaker OPEN - returning empty knowledge response');
      return this.generateEmptyResponse();
    }

    try {
      EdgeLogger.info('Starting knowledge query', {
        agentId,
        queryLength: query.length,
        maxResults
      });

      // Validate agent exists
      const { data: agent, error: agentError } = await this.supabase
        .from('agent_configurations')
        .select('id, name, agent_type')
        .eq('id', agentId)
        .single();

      if (agentError || !agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      EdgeLogger.debug('Agent validated', { agentName: agent.name, agentType: agent.agent_type });

      // Create vector store with proper configuration
      const vectorStore = new SupabaseVectorStore(this.embeddings, {
        client: this.supabase,
        tableName: 'agent_knowledge',
        queryName: 'match_agent_knowledge'
      });

      // Create retriever with agent filter
      const retriever = vectorStore.asRetriever({
        searchType: 'similarity',
        searchKwargs: {
          k: maxResults,
          filter: { agent_id: agentId }
        },
      });

      EdgeLogger.debug('Vector store and retriever configured', { agentId });

      // Perform similarity search
      const docs = await retriever.getRelevantDocuments(query);
      
      EdgeLogger.info('Knowledge retrieval completed', {
        documentsFound: docs.length,
        query: query.substring(0, 100)
      });

      if (docs.length === 0) {
        EdgeLogger.warn('No relevant knowledge found', { agentId, query: query.substring(0, 100) });
        return this.generateEmptyResponse();
      }

      // Create retrieval chain for enhanced response
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', `You are a knowledge assistant for the ${agent.name} agent. 
        
        Use the provided knowledge to answer the user's query. Be specific and cite relevant information.
        If the knowledge doesn't contain enough information to fully answer the query, say so clearly.
        
        Knowledge Context:
        {context}
        
        User Query: {question}
        
        Provide a comprehensive response based on the available knowledge.`],
        ['human', '{question}']
      ]);

      const documentChain = await createStuffDocumentsChain({
        llm: this.chatModel,
        prompt
      });

      const retrievalChain = await createRetrievalChain({
        retriever,
        combineDocsChain: documentChain
      });

      // Execute the retrieval chain
      const result = await retrievalChain.invoke({
        question: query,
        context: docs.map(doc => doc.pageContent).join('\n\n')
      });

      const duration = Date.now() - startTime;
      EdgeLogger.info('Knowledge query completed successfully', {
        duration,
        documentsUsed: docs.length,
        responseLength: result.answer?.length || 0
      });

      // Reset circuit breaker on success
      await this.circuitBreaker.reset();

      return {
        success: true,
        hasKnowledge: true,
        response: result.answer,
        sources: docs.map(doc => ({
          title: doc.metadata?.title || 'Untitled',
          content: doc.pageContent.substring(0, 200) + '...',
          relevance: doc.metadata?.relevance || 0.8
        })),
        agentId,
        query,
        metadata: {
          documentsFound: docs.length,
          processingTimeMs: duration,
          agentName: agent.name,
          agentType: agent.agent_type
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      EdgeLogger.error('Knowledge query failed', {
        error: error.message,
        duration,
        agentId,
        query: query.substring(0, 100)
      });

      await this.circuitBreaker.recordFailure();
      
      return this.generateErrorResponse(error.message);
    }
  }

  private generateEmptyResponse() {
    return {
      success: true,
      hasKnowledge: false,
      response: "No relevant knowledge found for this query.",
      sources: [],
      metadata: {
        documentsFound: 0,
        processingTimeMs: 0,
        reason: 'No matching knowledge found'
      }
    };
  }

  private generateErrorResponse(errorMessage: string) {
    return {
      success: false,
      hasKnowledge: false,
      response: "Unable to retrieve knowledge at this time.",
      sources: [],
      error: errorMessage,
      metadata: {
        documentsFound: 0,
        processingTimeMs: 0,
        reason: 'Query failed'
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
  
  EdgeLogger.debug('Parsing knowledge query request', { requestId, requiredFields });
  
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

interface KnowledgeRequest {
  query: string;
  agentId: string;
  maxResults?: number;
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
    EdgeLogger.info('Knowledge query function called', { 
      method: req.method, 
      url: req.url 
    });

    const { query, agentId, maxResults = 5 }: KnowledgeRequest = await parseAndValidateRequest(req, ['query', 'agentId']);
    const { supabase, openaiApiKey } = await validateAndGetEnvironment();

    EdgeLogger.info('Processing knowledge query request', {
      agentId,
      queryLength: query.length,
      maxResults
    });

    // Create knowledge query service
    const knowledgeService = new KnowledgeQueryService(supabase, openaiApiKey);
    
    // Execute knowledge query
    const result = await knowledgeService.queryKnowledge(query, agentId, maxResults);

    EdgeLogger.info('Knowledge query completed', {
      success: result.success,
      hasKnowledge: result.hasKnowledge,
      documentsFound: result.metadata?.documentsFound || 0
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
    EdgeLogger.error('Knowledge query error', error);
    
    // Fallback response when knowledge query fails
    const fallbackResponse = {
      success: false,
      error: 'Knowledge service temporarily unavailable',
      fallback: {
        results: [],
        message: 'Knowledge retrieval is currently unavailable. Please try again later.',
        metadata: {
          processingTimeMs: Date.now() - startTime,
          requestId: crypto.randomUUID(),
          version: '2.0.0',
          features: {
            circuitBreaker: true,
            enhancedLogging: true,
            sophisticatedAnalysis: false,
            modelSelection: false,
            fallbackSupport: true
          },
          performance: {
            totalProcessingTime: Date.now() - startTime
          },
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