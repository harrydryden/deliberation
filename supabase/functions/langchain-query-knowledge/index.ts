import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { OpenAIEmbeddings } from 'https://esm.sh/@langchain/openai@0.6.0?no-check';
import { ChatOpenAI } from 'https://esm.sh/@langchain/openai@0.6.0?no-check';
import { SupabaseVectorStore } from 'https://esm.sh/@langchain/community@0.3.0/vectorstores/supabase?no-check';
import { createRetrievalChain } from 'https://esm.sh/langchain@0.3.0/chains/retrieval?no-check';
import { createStuffDocumentsChain } from 'https://esm.sh/langchain@0.3.0/chains/combine_documents?no-check';
import { PromptTemplate } from 'https://esm.sh/@langchain/core@0.3.0/prompts?no-check';
import { ModelConfigManager } from "../shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== LANGCHAIN QUERY EDGE FUNCTION CALLED ===');
  console.log('Method:', req.method);

  const startTime = Date.now();
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Returning CORS response');
      return new Response('ok', { headers: corsHeaders });
    }

    console.log('Processing POST request...');

    // Add timeout wrapper for the entire function
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Function timeout after 50 seconds')), 50000);
    });

    // Parse request body
    const body = await req.json();
    console.log('Query:', body.query);
    console.log('Agent ID:', body.agentId);

    const { query, agentId, maxResults = 5 } = body;

    if (!query || !agentId) {
      console.log('Missing required fields');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing query or agentId',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Validate that the agent is a local agent (not a global template)
    console.log('Validating agent type...');
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

    // Get OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAIApiKey) {
      console.error('OpenAI API key not configured');
      throw new Error('Service configuration error');
    }

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const tempSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: templateData, error: templateError } = await tempSupabase
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

    return new Response(
      JSON.stringify({
        success: true,
        response: result.answer,
        knowledgeChunks: relevantKnowledge.length,
        relevantKnowledge,
        sources: uniqueSources,
        langchainProcessed: true,
        processingTimeMs: processingTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
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

    return new Response(
      JSON.stringify({
        success: false,
        error: `LangChain query error: ${error.message}`,
        errorType,
        processingTimeMs: processingTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});