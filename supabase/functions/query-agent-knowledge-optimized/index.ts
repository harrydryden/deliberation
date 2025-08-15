import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Performance configuration
const CACHE_TTL = 1800; // 30 minutes
const MAX_RESULTS = 20;
const SIMILARITY_THRESHOLD = 0.3;

// Redis cache for query results
const REDIS_URL = Deno.env.get('REDIS_URL');
let redisClient: any = null;

// Initialize Redis for caching query results
async function initRedis() {
  if (REDIS_URL && !redisClient) {
    try {
      const { Redis } = await import('https://deno.land/x/redis@v0.31.0/mod.ts');
      redisClient = new Redis(REDIS_URL);
      console.log('✅ Redis cache connected for query optimization');
    } catch (error) {
      console.warn('⚠️ Redis cache unavailable for queries:', error.message);
    }
  }
}

// Generate cache key for query
function generateCacheKey(agentId: string, query: string, maxResults: number): string {
  const queryHash = btoa(query).slice(0, 20);
  return `query:${agentId}:${queryHash}:${maxResults}`;
}

// Cached similarity search with performance optimization
async function performCachedSearch(
  supabase: any,
  agentId: string,
  queryEmbedding: number[],
  query: string,
  maxResults: number
): Promise<any[]> {
  const cacheKey = generateCacheKey(agentId, query, maxResults);
  
  // Check cache first
  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log('📋 Query cache hit');
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('⚠️ Cache read error:', error.message);
    }
  }

  // Perform optimized similarity search with multiple strategies
  console.log('🔍 Performing fresh similarity search');
  
  // Strategy 1: High similarity threshold for exact matches
  let { data: exactMatches, error: exactError } = await supabase.rpc(
    'match_agent_knowledge',
    {
      agent_id: agentId,
      query_embedding: queryEmbedding,
      match_threshold: 0.8,
      match_count: Math.min(maxResults / 2, 10)
    }
  );

  if (exactError) {
    console.warn('Exact match search error:', exactError);
    exactMatches = [];
  }

  // Strategy 2: Broader search for semantic matches if needed
  let semanticMatches: any[] = [];
  if (exactMatches.length < maxResults) {
    const { data: broadMatches, error: broadError } = await supabase.rpc(
      'match_agent_knowledge',
      {
        agent_id: agentId,
        query_embedding: queryEmbedding,
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: maxResults
      }
    );

    if (broadError) {
      console.warn('Broad search error:', broadError);
    } else {
      semanticMatches = broadMatches || [];
    }
  }

  // Combine and deduplicate results
  const combinedResults = [...exactMatches, ...semanticMatches];
  const uniqueResults = combinedResults.filter((item, index, self) => 
    index === self.findIndex(t => t.id === item.id)
  ).slice(0, maxResults);

  // Cache results for future queries
  if (redisClient && uniqueResults.length > 0) {
    try {
      await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(uniqueResults));
      console.log('💾 Cached query results');
    } catch (error) {
      console.warn('⚠️ Cache write error:', error.message);
    }
  }

  return uniqueResults;
}

// Enhanced query processing with performance monitoring
async function processQuery(
  supabase: any,
  agentId: string,
  query: string,
  maxResults: number = MAX_RESULTS
): Promise<any> {
  const startTime = performance.now();

  // Generate embedding for the query with caching
  const embeddingCacheKey = `embedding:${btoa(query).slice(0, 40)}`;
  let queryEmbedding: number[] | null = null;

  if (redisClient) {
    try {
      const cachedEmbedding = await redisClient.get(embeddingCacheKey);
      if (cachedEmbedding) {
        queryEmbedding = JSON.parse(cachedEmbedding);
        console.log('📋 Query embedding cache hit');
      }
    } catch (error) {
      console.warn('⚠️ Embedding cache read error:', error.message);
    }
  }

  if (!queryEmbedding) {
    console.log('🔄 Generating fresh query embedding');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query
      })
    });

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI embedding error: ${embeddingResponse.statusText}`);
    }

    const embeddingData = await embeddingResponse.json();
    queryEmbedding = embeddingData.data[0].embedding;

    // Cache the embedding
    if (redisClient) {
      try {
        await redisClient.setex(embeddingCacheKey, CACHE_TTL, JSON.stringify(queryEmbedding));
      } catch (error) {
        console.warn('⚠️ Embedding cache write error:', error.message);
      }
    }
  }

  // Perform cached similarity search
  const relevantKnowledge = await performCachedSearch(
    supabase,
    agentId,
    queryEmbedding,
    query,
    maxResults
  );

  const processingTime = performance.now() - startTime;

  return {
    success: true,
    relevantKnowledge,
    knowledgeChunks: relevantKnowledge.length,
    sources: [...new Set(relevantKnowledge.map(item => item.file_name).filter(Boolean))],
    performance: {
      processingTime: Math.round(processingTime),
      cacheEnabled: !!redisClient,
      resultsFound: relevantKnowledge.length,
      searchStrategies: ['exact_match', 'semantic_match'],
    }
  };
}

serve(async (req) => {
  console.log('🚀 OPTIMIZED KNOWLEDGE QUERY FUNCTION CALLED');

  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Initialize Redis cache
    await initRedis();

    const body = await req.json();
    const { agentId, query, maxResults = MAX_RESULTS, userId, deliberationId } = body;

    if (!agentId || !query) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing agentId or query'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`🔍 Optimized query for agent ${agentId}: "${query.slice(0, 50)}..."`);

    // Initialize Supabase with connection pooling
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
      global: {
        headers: {
          'Connection': 'keep-alive',
        },
      },
    });

    // Validate agent exists and is local
    const { data: agentData, error: agentError } = await supabase
      .from('agent_configurations')
      .select('id, deliberation_id')
      .eq('id', agentId)
      .single();

    if (agentError || !agentData.deliberation_id) {
      throw new Error('Invalid agent ID or global agent access denied');
    }

    // Process the optimized query
    const result = await processQuery(supabase, agentId, query, maxResults);

    // Close Redis connection
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (error) {
        console.warn('⚠️ Redis cleanup warning:', error.message);
      }
    }

    console.log(`✅ Query completed: ${result.knowledgeChunks} results in ${result.performance.processingTime}ms`);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('❌ ERROR IN OPTIMIZED QUERY:', error.message);

    // Cleanup on error
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (cleanupError) {
        console.warn('⚠️ Redis cleanup error:', cleanupError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Optimized query error: ${error.message}`
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});