import "xhr";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KnowledgeRequest {
  query: string;
  agentId: string;
  maxResults?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { query, agentId, maxResults = 5 }: KnowledgeRequest = await req.json();

    console.log('[knowledge_query] Processing request', { agentId, query: query.substring(0, 100), maxResults });

    // Validate agent exists
    const { data: agent, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, name')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Initialize OpenAI embeddings and chat model
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: "text-embedding-3-small",
    });

    const llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: "gpt-4o-mini",
      temperature: 0.3,
    });

    // Create vector store for agent knowledge
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: "agent_knowledge",
      queryName: "match_agent_knowledge",
      filter: { agent_id: agentId },
    });

    // Create retriever
    const retriever = vectorStore.asRetriever({
      searchType: "similarity",
      searchKwargs: {
        k: maxResults,
      },
    });

    // Get system prompt for this agent
    const { data: promptData } = await supabase.rpc('get_prompt_template', {
      template_name: 'knowledge_query_prompt'
    });

    const systemPromptTemplate = promptData?.[0]?.template_text || `
You are a knowledgeable assistant helping users find information from the knowledge base.
Use the provided context to answer the user's question accurately and helpfully.
If the context doesn't contain enough information to answer the question, say so clearly.
Always cite specific sources when possible.

Context: {context}

Question: {input}

Answer:`;

    // Create prompt template
    const prompt = ChatPromptTemplate.fromTemplate(systemPromptTemplate);

    // Create document chain
    const combineDocsChain = await createStuffDocumentsChain({
      llm,
      prompt,
    });

    // Create retrieval chain
    const retrievalChain = await createRetrievalChain({
      retriever,
      combineDocsChain,
    });

    // Execute the chain with timeout
    console.log('[knowledge_query] Executing retrieval chain');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 30000)
    );

    const result = await Promise.race([
      retrievalChain.invoke({ input: query }),
      timeoutPromise
    ]);

    // Extract sources from context documents
    const sources = result.context?.map((doc: any) => {
      const metadata = doc.metadata || {};
      return {
        title: metadata.title || metadata.file_name || 'Unknown',
        content_type: metadata.content_type || 'text',
        chunk_index: metadata.chunk_index,
        similarity: metadata.similarity
      };
    }) || [];

    console.log(`[knowledge_query] Query completed, found ${sources.length} sources`);

    return new Response(JSON.stringify({ 
      success: true,
      response: result.answer,
      sources: sources,
      query,
      agentId,
      generatedText: result.answer // For backward compatibility
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('[knowledge_query] Function error:', error);
    
    // Fallback to simple knowledge retrieval if LangChain fails
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
      const { query: fallbackQuery, agentId: fallbackAgentId, maxResults = 3 }: KnowledgeRequest = await req.json();
      
      const { data: knowledge, error: knowledgeError } = await supabase
        .from('agent_knowledge')
        .select('title, content, content_type, file_name')
        .eq('agent_id', fallbackAgentId)
        .textSearch('content', fallbackQuery, { type: 'websearch' })
        .limit(maxResults);

      if (!knowledgeError && knowledge && knowledge.length > 0) {
        const response = knowledge.map(k => `${k.title}: ${k.content.substring(0, 200)}...`).join('\n\n');
        return new Response(JSON.stringify({
          success: true,
          response: `Based on available knowledge:\n\n${response}`,
          sources: knowledge.map(k => ({ title: k.title || k.file_name, content_type: k.content_type })),
          fallback: true
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    } catch (fallbackError) {
      console.error('[knowledge_query] Fallback also failed:', fallbackError);
    }

    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      response: 'I apologize, but I encountered an error while searching the knowledge base. Please try again.',
      sources: []
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});