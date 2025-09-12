import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  parseAndValidateRequest,
  getOpenAIKey
} from '../shared/edge-function-utils.ts';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { PromptTemplate } from '@langchain/core/prompts';
import { ModelConfigManager } from "../shared/model-config.ts";
import { EdgeLogger, withTimeout, withRetry } from '../shared/edge-logger.ts';

serve(async (req) => {
  EdgeLogger.debug('LANGCHAIN QUERY EDGE FUNCTION CALLED', { method: req.method });

  const startTime = Date.now();
  
  try {
    // Handle CORS preflight with shared utility
    const corsResponse = handleCORSPreflight(req);
    if (corsResponse) return corsResponse;

    EdgeLogger.debug('Processing POST request');

    // Add timeout wrapper for the entire function
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Function timeout after 50 seconds')), 50000);
    });

    // Parse request body with validation
    const { query, agentId, maxResults = 5 } = await parseAndValidateRequest(req, ['query', 'agentId']);
    EdgeLogger.debug('Query received', { query: query.substring(0, 50), agentId, maxResults });

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();

    // Validate that the agent is a local agent (not a global template)
    EdgeLogger.debug('Validating agent type');
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single();

    if (agentError) {
      console.error('Agent validation error:', agentError);
      throw new Error('Invalid agent ID');
    }

    if (!agentData.deliberation_id) {
      console.error('Attempted to query knowledge from global agent:', agentId);
      throw new Error(
        'Knowledge queries are only available for local agents (specific to deliberations), not global template agents'
      );
    }

    console.log('Agent validation passed - local agent confirmed');

    // Get OpenAI API key with caching
    const openAIApiKey = getOpenAIKey();

    console.log('Initializing LangChain components...');

    // Initialize LangChain components with retry logic
    let embeddings, llm;
    
    try {
      embeddings = new OpenAIEmbeddings({
        openAIApiKey: openAIApiKey,
        modelName: 'text-embedding-3-small',
        timeout: 30000, // 30 second timeout
      });

      // Select optimal model for knowledge querying
      const selectedModel = ModelConfigManager.selectOptimalModel({
        complexity: 0.7,
        requiresReasoning: false,
        maxTokensNeeded: 2000,
        preferredModel: 'gpt-5-2025-08-07'
      });

      console.log(`🤖 Using model: ${selectedModel} for knowledge query`);

      llm = new ChatOpenAI({
        openAIApiKey: openAIApiKey,
        modelName: selectedModel,
        maxRetries: 2,
        timeout: 30000,
      });
      
      console.log('✅ LangChain components initialized successfully');
    } catch (initError) {
      console.error('❌ Failed to initialize LangChain components:', initError);
      throw new Error(`LangChain initialization failed: ${initError.message}`);
    }

    // Create vector store instance for retrieval
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: 'agent_knowledge',
      queryName: 'match_agent_knowledge',
      filter: { agent_id: agentId },
    });

    console.log('Creating retriever...');

    // Create retriever with similarity search
    const retriever = vectorStore.asRetriever({
      k: maxResults,
      searchType: 'similarity',
      searchKwargs: {
        threshold: 0.1, // Low threshold for broader retrieval
      },
    });

    // Get policy analysis prompt from template system

    const { data: templateData, error: templateError } = await supabase
      .rpc('get_prompt_template', { 
        template_name: 'langchain_policy_analysis'
      });

    if (templateError || !templateData || templateData.length === 0) {
      throw new Error(`Failed to get prompt template: ${templateError?.message || 'Template not found'}`);
    }

    const template = templateData[0];

    // Create enhanced prompt template for policy analysis using database template
    // Convert our {{variable}} format to LangChain's {variable} format
    const langchainTemplate = template.template_text
      .replace(/\{\{context\}\}/g, '{context}')
      .replace(/\{\{input\}\}/g, '{input}');
    
    const promptTemplate = PromptTemplate.fromTemplate(langchainTemplate);

    console.log('Creating retrieval chain...');

    // Create document chain for combining documents
    const documentChain = await createStuffDocumentsChain({
      llm,
      prompt: promptTemplate,
    });

    // Create retrieval chain
    const chain = await createRetrievalChain({
      retriever,
      combineDocsChain: documentChain,
    });

    console.log('Executing query...');

    // Execute the query with timeout
    const queryPromise = chain.invoke({
      input: query,
    });
    
    const result = await Promise.race([queryPromise, timeoutPromise]);

    console.log(`Query completed. Found ${result.context?.length || 0} source documents`);

    // Extract source information
    const sources = result.context?.map((doc) => {
      const metadata = doc.metadata || {};
      return metadata.fileName || metadata.title || 'Unknown source';
    }) || [];

    // Get unique sources
    const uniqueSources = [...new Set(sources)];

    // Format relevant knowledge for response
    const relevantKnowledge = result.context?.map((doc, index) => ({
      id: `langchain-chunk-${index}`,
      content: doc.pageContent,
      metadata: doc.metadata,
      similarity: 0.8, // LangChain doesn't return similarity scores directly
      title: doc.metadata?.title || `Chunk ${index + 1}`,
      file_name: doc.metadata?.fileName,
      chunk_index: doc.metadata?.chunkIndex || index,
    })) || [];

    const processingTime = Date.now() - startTime;
    console.log(`✅ LangChain RAG query completed successfully in ${processingTime}ms`);

    return createSuccessResponse({
      success: true,
      response: result.answer,
      knowledgeChunks: relevantKnowledge.length,
      relevantKnowledge,
      sources: uniqueSources,
      langchainProcessed: true,
      processingTimeMs: processingTime,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== ERROR IN LANGCHAIN QUERY EDGE FUNCTION ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error(`Processing time before error: ${processingTime}ms`);
    
    // Determine error type for better debugging
    const errorType = error.message.includes('timeout') ? 'TIMEOUT' : 
                     error.message.includes('initialization') ? 'INITIALIZATION' : 
                     error.message.includes('configuration') ? 'CONFIGURATION' : 'PROCESSING';

    return createErrorResponse(error, 500, 'langchain-query-knowledge', {
      errorType,
      processingTimeMs: processingTime,
    });
  }
});