import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { OpenAIEmbeddings } from "https://esm.sh/@langchain/openai@0.6.3";
import { SupabaseVectorStore } from "https://esm.sh/@langchain/community@0.3.49/vectorstores/supabase";
import { Document } from "https://esm.sh/@langchain/core@0.3.68/documents";

// LangChain-powered RAG knowledge query with vector search and fallbacks
// Returns enhanced results with semantic similarity and LangChain processing

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

class EdgeLogger {
  static fmt(level: string, message: string, data?: any) {
    const ts = new Date().toISOString();
    const d = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${ts}] [${level}] ${message}${d}`;
  }
  static debug(m: string, d?: any) { console.log(this.fmt('DEBUG', m, d)); }
  static info(m: string, d?: any) { console.log(this.fmt('INFO', m, d)); }
  static warn(m: string, d?: any) { console.warn(this.fmt('WARN', m, d)); }
  static error(m: string, d?: any) { console.error(this.fmt('ERROR', m, d)); }
}

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function parseBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch (e) {
    throw new Error('Invalid JSON body');
  }
}

function requireEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiApiKey) missing.push('OPENAI_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return { supabaseUrl, supabaseServiceKey, openaiApiKey };
}

class LangChainRAGService {
  private embeddings: OpenAIEmbeddings;
  private supabase: any;
  
  constructor(supabase: any, openaiApiKey: string) {
    this.supabase = supabase;
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey,
      modelName: 'text-embedding-3-small',
      maxRetries: 2,
      timeout: 15000
    });
  }

  async queryKnowledge(query: string, agentId?: string, maxResults: number = 5, threshold: number = 0.35): Promise<any> {
    try {
      EdgeLogger.info('Starting LangChain RAG query', { 
        queryLength: query.length, 
        agentId, 
        maxResults, 
        threshold 
      });

      // Create vector store for agent knowledge
      const vectorStore = new SupabaseVectorStore(this.embeddings, {
        client: this.supabase,
        tableName: 'agent_knowledge',
        queryName: 'match_agent_knowledge',
        filter: agentId ? { agent_id: agentId } : undefined
      });

      // Perform semantic search
      const searchResults = await vectorStore.similaritySearchWithScore(query, maxResults);
      
      EdgeLogger.debug('LangChain semantic search completed', { 
        resultsFound: searchResults.length,
        agentId
      });

      if (searchResults.length === 0) {
        EdgeLogger.info('No semantic matches found, trying fallback search');
        return await this.fallbackSearch(query, agentId, maxResults);
      }

      // Filter by threshold and format results
      const filteredResults = searchResults
        .filter(([doc, score]) => score >= threshold)
        .map(([doc, score]) => ({
          id: doc.metadata.id,
          agent_id: doc.metadata.agent_id,
          title: doc.metadata.title || 'Untitled',
          content: doc.pageContent,
          content_type: doc.metadata.content_type,
          file_name: doc.metadata.file_name,
          chunk_index: doc.metadata.chunk_index,
          similarity: score,
          created_at: doc.metadata.created_at
        }));

      EdgeLogger.info('LangChain RAG query completed', { 
        totalResults: searchResults.length,
        filteredResults: filteredResults.length,
        threshold
      });

      return {
        success: true,
        results: filteredResults,
        langchainProcessed: true,
        metadata: {
          totalSearchResults: searchResults.length,
          filteredByThreshold: filteredResults.length,
          threshold,
          agentId
        }
      };

    } catch (error) {
      EdgeLogger.error('LangChain RAG query failed', { error: error.message, agentId });
      
      // Fallback to direct database query
      EdgeLogger.info('Falling back to direct database query');
      return await this.fallbackSearch(query, agentId, maxResults);
    }
  }

  private async fallbackSearch(query: string, agentId?: string, maxResults: number = 5): Promise<any> {
    try {
      let dbQuery = this.supabase
        .from('agent_knowledge')
        .select('id, agent_id, title, content, content_type, file_name, chunk_index, metadata, created_at')
        .limit(maxResults);

      if (agentId) {
        dbQuery = dbQuery.eq('agent_id', agentId);
      }

      // Simple text search
      dbQuery = dbQuery.or(
        `title.ilike.%${query}%,content.ilike.%${query}%`
      );

      const { data: fallbackResults, error } = await dbQuery;
      
      if (error) throw error;

      const results = (fallbackResults || []).map(item => ({
        ...item,
        similarity: 0.5, // Default similarity for text search
      }));

      EdgeLogger.info('Fallback search completed', { 
        results: results.length, 
        agentId 
      });

      return {
        success: true,
        results,
        langchainProcessed: false,
        fallbackUsed: true,
        metadata: {
          searchType: 'text_fallback',
          agentId
        }
      };

    } catch (error) {
      EdgeLogger.error('Fallback search failed', { error: error.message, agentId });
      return {
        success: false,
        results: [],
        error: error.message,
        langchainProcessed: false,
        fallbackUsed: true
      };
    }
  }
}

serve(async (req) => {
  const pre = handleCORSPreflight(req);
  if (pre) return pre;

  const start = Date.now();
  try {
    EdgeLogger.info('LangChain Knowledge query called', { method: req.method, url: req.url });
    const body = await parseBody(req);

    const query: string = body?.query;
    const agentId: string | undefined = body?.agentId;
    const maxResults: number = body?.maxResults ?? 5;
    const threshold: number = body?.threshold ?? 0.35;

    if (!query) {
      return jsonResponse({ error: 'Missing required field: query' }, 400);
    }

    const { supabaseUrl, supabaseServiceKey, openaiApiKey } = requireEnv();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to infer agent context if not provided by picking default bill agent
    let effectiveAgentId = agentId;
    if (!effectiveAgentId) {
      EdgeLogger.debug('No agentId provided, searching for default bill_agent');
      const { data: ac } = await supabase
        .from('agent_configurations')
        .select('id')
        .eq('agent_type', 'bill_agent')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      effectiveAgentId = ac?.id || null;
      EdgeLogger.debug('Default agent selected', { effectiveAgentId });
    }

    // Create LangChain RAG service
    const ragService = new LangChainRAGService(supabase, openaiApiKey);
    
    // Perform LangChain-powered knowledge query
    const result = await ragService.queryKnowledge(query, effectiveAgentId, maxResults, threshold);

    // Add processing metadata
    result.metadata = {
      ...result.metadata,
      processingTimeMs: Date.now() - start,
      query: query.substring(0, 100), // First 100 chars for debugging
      effectiveAgentId
    };

    EdgeLogger.info('LangChain Knowledge query completed', {
      success: result.success,
      results: result.results?.length || 0,
      langchainProcessed: result.langchainProcessed,
      fallbackUsed: result.fallbackUsed,
      processingTimeMs: Date.now() - start
    });

    return jsonResponse(result);

  } catch (error: any) {
    EdgeLogger.error('LangChain Knowledge query failed', { error: error.message, stack: error.stack });
    return jsonResponse({ 
      success: false, 
      results: [], 
      error: error.message,
      langchainProcessed: false,
      metadata: { 
        processingTimeMs: Date.now() - start,
        errorType: 'unexpected_error'
      } 
    }, 200);
  }
});