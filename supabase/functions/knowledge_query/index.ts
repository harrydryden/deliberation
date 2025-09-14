import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

// Enhanced knowledge query with RAG capabilities
// - Query analysis and intent classification
// - Hybrid retrieval (vector + text search)
// - Context-aware response generation using agent prompts
// - Source attribution and evidence tracking

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, cache-control, x-requested-with",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

class RAGLogger {
  static debug(message: string, data?: any) {
    console.log(`[RAG-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  static info(message: string, data?: any) {
    console.log(`[RAG-INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  static warn(message: string, data?: any) {
    console.warn(`[RAG-WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  static error(message: string, error?: any) {
    console.error(`[RAG-ERROR] ${message}`, error);
  }

  static performance(operation: string, duration: number, metadata?: any) {
    console.log(`[RAG-PERF] ${operation}: ${duration}ms`, metadata ? JSON.stringify(metadata) : '');
  }
}

interface QueryAnalysis {
  intent: 'factual' | 'procedural' | 'comparative' | 'analytical' | 'exploratory';
  complexity: 'simple' | 'moderate' | 'complex';
  entities: string[];
  jurisdiction?: string;
  confidence: number;
  queryExpansions: string[];
  subQuestions?: string[];
}

class QueryAnalyzer {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private openaiKey: string
  ) {}

  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const startTime = Date.now();
    
    try {
      const intent = this.classifyIntent(query);
      const complexity = this.assessComplexity(query);
      const entities = this.extractEntityTypes(query);
      const jurisdiction = this.detectJurisdiction(query);
      
      // Generate query expansions using OpenAI
      const expansions = await this.generateQueryExpansions(query);
      const safeExpansions = Array.isArray(expansions) && expansions.length > 0
        ? expansions
        : [query];
      
      // For complex queries, decompose into sub-questions
      let subQuestions: string[] | undefined;
      if (complexity === 'complex') {
        subQuestions = await this.decomposeQuery(query);
      }

      const analysis: QueryAnalysis = {
        intent,
        complexity,
        entities,
        jurisdiction,
        confidence: this.calculateConfidence(intent, complexity, entities),
        queryExpansions: safeExpansions,
        subQuestions
      };

      RAGLogger.performance('Query Analysis', Date.now() - startTime, {
        intent,
        complexity,
        expansionsCount: safeExpansions.length,
        subQuestionsCount: subQuestions?.length || 0
      });

      return analysis;
    } catch (error) {
      RAGLogger.error('Query analysis failed', error);
      // Return basic analysis as fallback
      return {
        intent: 'factual',
        complexity: 'simple',
        entities: [],
        confidence: 0.5,
        queryExpansions: [query]
      };
    }
  }

  private classifyIntent(query: string): QueryAnalysis['intent'] {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('how to') || lowerQuery.includes('process') || lowerQuery.includes('procedure') || lowerQuery.includes('steps')) {
      return 'procedural';
    }
    if (lowerQuery.includes('compare') || lowerQuery.includes('versus') || lowerQuery.includes('vs') || lowerQuery.includes('difference')) {
      return 'comparative';
    }
    if (lowerQuery.includes('analyze') || lowerQuery.includes('evaluate') || lowerQuery.includes('assess') || lowerQuery.includes('impact')) {
      return 'analytical';
    }
    if (lowerQuery.includes('explore') || lowerQuery.includes('understand') || lowerQuery.includes('learn about')) {
      return 'exploratory';
    }
    
    return 'factual';
  }

  private assessComplexity(query: string): QueryAnalysis['complexity'] {
    const wordCount = query.split(/\s+/).length;
    const hasMultipleClauses = query.includes('and') || query.includes('or') || query.includes('but');
    const hasQuestionWords = /\b(what|when|where|who|why|how|which)\b/gi.test(query);
    
    if (wordCount > 15 || (hasMultipleClauses && hasQuestionWords)) {
      return 'complex';
    }
    if (wordCount > 8 || hasMultipleClauses || hasQuestionWords) {
      return 'moderate';
    }
    
    return 'simple';
  }

  private extractEntityTypes(query: string): string[] {
    const entities: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Policy/Legislative entities
    if (/\b(bill|law|legislation|act|statute|regulation|policy|amendment)\b/.test(lowerQuery)) {
      entities.push('legislation');
    }
    
    // Government entities
    if (/\b(senate|house|congress|committee|government|agency|department)\b/.test(lowerQuery)) {
      entities.push('government');
    }
    
    // Legal entities
    if (/\b(court|judge|ruling|decision|case|precedent)\b/.test(lowerQuery)) {
      entities.push('legal');
    }
    
    // Financial entities
    if (/\b(budget|funding|cost|tax|revenue|appropriation)\b/.test(lowerQuery)) {
      entities.push('financial');
    }
    
    return entities;
  }

  private detectJurisdiction(query: string): string | undefined {
    const jurisdictionPatterns = [
      /\b(federal|national)\b/i,
      /\b(state|california|texas|new york|florida)\b/i,
      /\b(local|city|county|municipal)\b/i
    ];
    
    for (const pattern of jurisdictionPatterns) {
      const match = query.match(pattern);
      if (match) {
        return match[0].toLowerCase();
      }
    }
    
    return undefined;
  }

  private calculateConfidence(intent: string, complexity: string, entities: string[]): number {
    let confidence = 0.7; // Base confidence
    
    // Adjust based on complexity
    if (complexity === 'simple') confidence += 0.2;
    else if (complexity === 'complex') confidence -= 0.1;
    
    // Adjust based on entities found
    confidence += Math.min(entities.length * 0.05, 0.2);
    
    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  private async generateQueryExpansions(query: string): Promise<string[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Generate 3-5 alternative phrasings or related questions for the given query. Focus on policy, legislative, and government contexts. Return only the alternative queries, one per line.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 200,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      
      const expansions = content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .slice(0, 5);
      
      return expansions.length > 0 ? expansions : [query];
    } catch (error) {
      RAGLogger.warn('Failed to generate query expansions', error);
      return [query];
    }
  }

  private async decomposeQuery(query: string): Promise<string[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Break down this complex query into 2-4 simpler, focused sub-questions that together would answer the original question. Focus on policy and legislative contexts. Return only the sub-questions, one per line.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 200,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      return content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .slice(0, 4);
    } catch (error) {
      RAGLogger.warn('Failed to decompose query', error);
      return [query];
    }
  }
}

class HybridRetriever {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private openaiKey: string
  ) {}

  private async generateEmbedding(text: string): Promise<number[]> {
    const cleaned = (text ?? '').toString().trim();
    if (!cleaned) {
      throw new Error('Embedding input is empty');
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: cleaned }),
    });

    if (!response.ok) {
      const msg = await response.text();
      throw new Error(`OpenAI embeddings error: ${response.status} ${response.statusText} - ${msg}`);
    }

    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
    if (!Array.isArray(vector)) throw new Error("Invalid embedding response format");
    return vector as number[];
  }

  async retrieveDocuments(
    analysis: QueryAnalysis,
    agentId: string,
    maxResults: number = 10
  ): Promise<any[]> {
    const startTime = Date.now();
    const allResults: any[] = [];

    try {
      // Primary query search
      const primaryResults = await this.performVectorSearch(
        analysis.queryExpansions[0],
        agentId,
        Math.ceil(maxResults * 0.6)
      );
      allResults.push(...primaryResults.map(r => ({ ...r, source: 'primary' })));

      // Expansion queries for broader context
      for (const expansion of analysis.queryExpansions.slice(1, 3)) {
        try {
          const expansionResults = await this.performVectorSearch(
            expansion,
            agentId,
            Math.ceil(maxResults * 0.2)
          );
          allResults.push(...expansionResults.map(r => ({ ...r, source: 'expansion' })));
        } catch (error) {
          RAGLogger.warn(`Expansion query failed: ${expansion}`, error);
        }
      }

      // Sub-question searches for complex queries
      if (analysis.subQuestions) {
        for (const subQuestion of analysis.subQuestions.slice(0, 2)) {
          try {
            const subResults = await this.performVectorSearch(
              subQuestion,
              agentId,
              Math.ceil(maxResults * 0.15)
            );
            allResults.push(...subResults.map(r => ({ ...r, source: 'sub-question' })));
          } catch (error) {
            RAGLogger.warn(`Sub-question search failed: ${subQuestion}`, error);
          }
        }
      }

      // Fuse and rank results
      const finalResults = this.fuseResults(allResults, maxResults);

      RAGLogger.performance('Document Retrieval', Date.now() - startTime, {
        totalResults: allResults.length,
        finalResults: finalResults.length,
        sources: {
          primary: allResults.filter(r => r.source === 'primary').length,
          expansion: allResults.filter(r => r.source === 'expansion').length,
          subQuestion: allResults.filter(r => r.source === 'sub-question').length
        }
      });

      return finalResults;
    } catch (error) {
      RAGLogger.error('Document retrieval failed', error);
      // Fallback to text search with safest available query
      const fallbackQuery = (analysis.queryExpansions && analysis.queryExpansions[0])
        ? analysis.queryExpansions[0]
        : (analysis.subQuestions && analysis.subQuestions[0])
        ? analysis.subQuestions[0]
        : '';
      return await this.fallbackTextSearch(fallbackQuery, agentId, maxResults);
    }
  }

  private async performVectorSearch(query: string, agentId: string, limit: number): Promise<any[]> {
    const embedding = await this.generateEmbedding(query);
    
    const { data, error } = await this.supabase.rpc("match_agent_knowledge", {
      input_agent_id: agentId,
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: limit,
    });

    if (error) throw error;

    return (data || []).map((r: any) => ({
      id: r.id,
      agent_id: r.agent_id,
      title: r.title,
      content: r.content,
      content_type: r.content_type,
      file_name: r.file_name,
      chunk_index: r.chunk_index,
      metadata: r.metadata,
      similarity: typeof r.similarity === "number" ? r.similarity : null,
      created_at: r.created_at,
    }));
  }

  private fuseResults(allResults: any[], maxResults: number): any[] {
    // Remove duplicates and rank by similarity
    const uniqueResults = new Map();
    
    for (const result of allResults) {
      const key = `${result.id}-${result.chunk_index}`;
      if (!uniqueResults.has(key) || 
          (result.similarity && result.similarity > (uniqueResults.get(key).similarity || 0))) {
        uniqueResults.set(key, result);
      }
    }
    
    return Array.from(uniqueResults.values())
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, maxResults);
  }

  private async fallbackTextSearch(query: string, agentId: string, maxResults: number): Promise<any[]> {
    let q = this.supabase
      .from("agent_knowledge")
      .select("id, agent_id, title, content, content_type, file_name, chunk_index, metadata, created_at")
      .limit(maxResults);

    if (agentId) q = q.eq("agent_id", agentId);
    q = q.or(`title.ilike.%${query}%,content.ilike.%${query}%`);

    const { data, error } = await q;
    if (error) throw error;

    return (data || []).map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      title: r.title,
      content: r.content,
      content_type: r.content_type,
      file_name: r.file_name,
      chunk_index: r.chunk_index,
      metadata: r.metadata,
      similarity: null as number | null,
      created_at: r.created_at,
    }));
  }
}

class ResponseGenerator {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private openaiKey: string
  ) {}

  async generateResponse(
    query: string,
    analysis: QueryAnalysis,
    documents: any[],
    agentId: string,
    conversationHistory: string[] = []
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      if (!documents.length) {
        return this.generateFallbackResponse(query, analysis);
      }

      // Get agent prompts from database
      const systemPrompt = await this.getAgentSystemPrompt(agentId);
      
      // Prepare context from documents
      const context = documents
        .map((doc, index) => `[Source ${index + 1}: ${doc.file_name || 'Document'} - ${doc.title || 'Untitled'}]\n${doc.content}`)
        .join('\n\n');

      // Prepare conversation context
      const historyContext = conversationHistory.length > 0 
        ? `\n\nRecent conversation:\n${conversationHistory.slice(-4).join('\n')}`
        : '';

      // Apply template variable substitution for langchain_policy_analysis
      const processedSystemPrompt = this.substituteTemplateVariables(systemPrompt, {
        context: `${context}${historyContext}`,
        input: query
      });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: processedSystemPrompt
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 1000,
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Prepare sources for attribution
      const sources = documents.map((doc, index) => ({
        id: doc.id,
        title: doc.title || 'Untitled',
        file_name: doc.file_name,
        content_type: doc.content_type,
        similarity: doc.similarity,
        sourceNumber: index + 1,
        chunk_index: doc.chunk_index
      }));

      const result = {
        success: true,
        method: 'enhanced_rag',
        response: {
          content,
          sources,
          analysis: {
            intent: analysis.intent,
            complexity: analysis.complexity,
            confidence: analysis.confidence,
            entitiesFound: analysis.entities
          }
        },
        metadata: {
          durationMs: Date.now() - startTime,
          query: query.slice(0, 100),
          agent_id: agentId,
          documentsUsed: documents.length,
          queryExpansions: analysis.queryExpansions.length
        }
      };

      RAGLogger.performance('Response Generation', Date.now() - startTime, {
        contentLength: content.length,
        sourcesCount: sources.length,
        analysis: analysis
      });

      return result;
    } catch (error) {
      RAGLogger.error('Response generation failed', error);
      return this.generateErrorResponse((error as Error)?.message ?? String(error), query);
    }
  }

  private async getAgentSystemPrompt(agentId: string): Promise<string> {
    try {
      const promptService = new PromptTemplateService(this.supabase);
      
      // Get agent configuration
      const { data: agentData, error: agentError } = await this.supabase
        .from('agent_configurations')
        .select('agent_type, response_style, goals')
        .eq('id', agentId)
        .single();

      // Prepare template variables
      const templateVariables = {
        agent_type: agentData?.agent_type || 'policy_assistant',
        response_style: agentData?.response_style || 'professional',
        goals: agentData?.goals?.join(', ') || 'assist users with policy analysis',
        agent_context: agentData ? [
          `Agent Type: ${agentData.agent_type}`,
          agentData.response_style ? `Response Style: ${agentData.response_style}` : '',
          agentData.goals?.length ? `Goals: ${agentData.goals.join(', ')}` : ''
        ].filter(Boolean).join('\n') : ''
      };

      const fallbackPrompt = 'You are a helpful AI assistant specializing in policy and legislative analysis. Provide accurate, well-researched responses based on the provided context. Focus on policy and legislative analysis with clear, actionable insights.';

      // Try to get the langchain_policy_analysis template
      const { prompt: enhancedPrompt, isTemplate } = await promptService.generatePrompt(
        'langchain_policy_analysis',
        templateVariables,
        fallbackPrompt
      );

      RAGLogger.info(isTemplate ? 'Using langchain_policy_analysis template' : 'Using fallback prompt for policy analysis');
      
      return enhancedPrompt;
      
    } catch (error) {
      RAGLogger.error('Error fetching agent prompts', error);
      return 'You are a helpful AI assistant specializing in policy and legislative analysis. Provide accurate, well-researched responses based on the provided context.';
    }
  }

  private generateFallbackResponse(query: string, analysis: QueryAnalysis): any {
    return {
      success: true,
      method: 'no_documents_found',
      response: {
        content: `I don't have specific information in my knowledge base to answer your question about "${query}". This might be because:

1. The topic isn't covered in the current document collection
2. The query might need to be rephrased for better results
3. Additional documents may need to be uploaded to the knowledge base

Based on your question, it appears you're looking for ${analysis.intent} information. You might try:
- Rephrasing your question with different keywords
- Breaking down complex questions into simpler parts
- Checking if relevant documents have been uploaded to the system`,
        sources: [],
        analysis: {
          intent: analysis.intent,
          complexity: analysis.complexity,
          confidence: analysis.confidence,
          entitiesFound: analysis.entities
        }
      },
      metadata: {
        query: query.slice(0, 100),
        reason: 'no_documents_found'
      }
    };
  }

  private substituteTemplateVariables(template: string, variables: Record<string, string>): string {
    let processedTemplate = template;
    
    // Replace template variables (e.g., {{context}}, {{input}})
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      processedTemplate = processedTemplate.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    return processedTemplate;
  }

  private generateErrorResponse(errorMessage: string, query: string): any {
    return {
      success: false,
      error: errorMessage,
      response: {
        content: "I encountered an error while processing your request. Please try again or rephrase your question.",
        sources: [],
        analysis: null
      },
      metadata: {
        query: query.slice(0, 100),
        error: errorMessage
      }
    };
  }
}

class EnhancedKnowledgeService {
  private queryAnalyzer: QueryAnalyzer;
  private hybridRetriever: HybridRetriever;
  private responseGenerator: ResponseGenerator;

  constructor(
    private supabase: ReturnType<typeof createClient>,
    private openaiKey: string
  ) {
    this.queryAnalyzer = new QueryAnalyzer(supabase, openaiKey);
    this.hybridRetriever = new HybridRetriever(supabase, openaiKey);
    this.responseGenerator = new ResponseGenerator(supabase, openaiKey);
  }

  async processQuery(
    query: string,
    agentId?: string,
    options: {
      maxResults?: number;
      threshold?: number;
      conversationHistory?: string[];
      generateResponse?: boolean;
    } = {}
  ): Promise<any> {
    const startTime = Date.now();
    const {
      maxResults = 10,
      threshold = 0.35,
      conversationHistory = [],
      generateResponse = true
    } = options;

    try {
      RAGLogger.info('Processing enhanced knowledge query', {
        query: query.slice(0, 100),
        agentId,
        options
      });

      // Get effective agent ID
      const effectiveAgentId = agentId || await this.getDefaultBillAgent();
      if (!effectiveAgentId) {
        return {
          success: false,
          error: "No agent configuration found",
          results: [],
          metadata: { query: query.slice(0, 64) }
        };
      }

      // Analyze the query
      const analysis = await this.queryAnalyzer.analyzeQuery(query);
      RAGLogger.debug('Query analysis completed', analysis);

      // Retrieve relevant documents
      const documents = await this.hybridRetriever.retrieveDocuments(
        analysis,
        effectiveAgentId,
        maxResults
      );
      RAGLogger.debug(`Retrieved ${documents.length} documents`);

      // If not generating a response, return the documents in the original format
      if (!generateResponse) {
        const results = documents.map(doc => ({
          id: doc.id,
          agent_id: doc.agent_id,
          title: doc.title,
          content: doc.content,
          content_type: doc.content_type,
          file_name: doc.file_name,
          chunk_index: doc.chunk_index,
          metadata: doc.metadata,
          similarity: doc.similarity,
          created_at: doc.created_at,
        }));

        return {
          success: true,
          method: documents.length > 0 ? "vector_match" : "text_fallback_no_matches",
          results,
          metadata: {
            durationMs: Date.now() - startTime,
            query: query.slice(0, 64),
            agent_id: effectiveAgentId,
            analysis
          }
        };
      }

      // Generate intelligent response
      const response = await this.responseGenerator.generateResponse(
        query,
        analysis,
        documents,
        effectiveAgentId,
        conversationHistory
      );

      RAGLogger.info('Enhanced knowledge query completed', {
        durationMs: Date.now() - startTime,
        documentsFound: documents.length,
        responseGenerated: !!response.response?.content
      });

      return response;
    } catch (error) {
      RAGLogger.error('Enhanced knowledge query failed', error);
      
      // Fallback to basic text search
      try {
        const fallbackResults = await this.basicFallback(query, agentId, maxResults);
        return {
          success: true,
          method: "text_fallback_error",
          results: fallbackResults,
          metadata: {
            durationMs: Date.now() - startTime,
            query: query.slice(0, 64),
            agent_id: agentId,
            error: (error as Error)?.message ?? String(error)
          }
        };
      } catch (fallbackError) {
        return {
          success: false,
          results: [],
          error: (error as Error)?.message ?? String(error),
          metadata: {
            durationMs: Date.now() - startTime,
            query: query.slice(0, 64)
          }
        };
      }
    }
  }

  private async getDefaultBillAgent(): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from("agent_configurations")
        .select("id")
        .eq("agent_type", "bill_agent")
        .eq("is_default", true)
        .maybeSingle();

      return error || !data ? null : data.id;
    } catch (error) {
      RAGLogger.warn('Failed to get default agent', error);
      return null;
    }
  }

  private async basicFallback(query: string, agentId?: string, maxResults: number = 5): Promise<any[]> {
    let q = this.supabase
      .from("agent_knowledge")
      .select("id, agent_id, title, content, content_type, file_name, chunk_index, metadata, created_at")
      .limit(maxResults);

    if (agentId) q = q.eq("agent_id", agentId);
    q = q.or(`title.ilike.%${query}%,content.ilike.%${query}%`);

    const { data, error } = await q;
    if (error) throw error;

    return (data || []).map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      title: r.title,
      content: r.content,
      content_type: r.content_type,
      file_name: r.file_name,
      chunk_index: r.chunk_index,
      metadata: r.metadata,
      similarity: null as number | null,
      created_at: r.created_at,
    }));
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnvironment() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } as const;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStart = Date.now();
  
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = getEnvironment();
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const query: string = (body?.query || "").toString().trim();
    const agentId: string | undefined = body?.agentId || body?.agent_id || undefined;
    const maxResults: number = Number(body?.maxResults ?? 10) || 10;
    const threshold: number = Number(body?.threshold ?? 0.35) || 0.35;
    const conversationHistory: string[] = body?.conversationHistory || [];
    const generateResponse: boolean = body?.generateResponse !== false; // Default to true

    if (!query) {
      return jsonResponse({ error: "Missing required field: query" }, 400);
    }

    RAGLogger.info('Knowledge query request received', {
      queryLength: query.length,
      agentId,
      maxResults,
      threshold,
      generateResponse
    });

    const knowledgeService = new EnhancedKnowledgeService(supabase, OPENAI_API_KEY);
    
    const result = await knowledgeService.processQuery(query, agentId, {
      maxResults,
      threshold,
      conversationHistory,
      generateResponse
    });

    RAGLogger.performance('Total Request', Date.now() - requestStart, {
      success: result.success,
      method: result.method,
      resultsCount: result.results?.length || 0
    });

    return jsonResponse(result);
  } catch (error) {
    RAGLogger.error("Knowledge query fatal error", error);
    return jsonResponse({
      success: false,
      results: [],
      error: (error as Error)?.message ?? String(error),
      metadata: {
        durationMs: Date.now() - requestStart
      }
    }, 500);
  }
});