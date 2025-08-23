import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { OpenAIEmbeddings } from 'https://esm.sh/@langchain/openai@0.6.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    return 0;
  }

  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

serve(async (req) => {
  console.log('🔍 Agent Knowledge Query Function Called');

  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    const body = await req.json();
    const { agentId, query, limit = 5 } = body;

    if (!agentId || !query) {
      return new Response(
        JSON.stringify({ error: 'Missing agentId or query' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize services
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openAIApiKey) {
      throw new Error('Missing service configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: openAIApiKey,
      modelName: 'text-embedding-3-small',
    });

    // Generate embedding for the query
    console.log('🧠 Generating query embedding...');
    const queryEmbedding = await embeddings.embedQuery(query);

    // Fetch all knowledge for the agent
    const { data: knowledgeItems, error } = await supabase
      .from('agent_knowledge')
      .select('*')
      .eq('agent_id', agentId);

    if (error) {
      throw new Error(`Failed to fetch knowledge: ${error.message}`);
    }

    if (!knowledgeItems || knowledgeItems.length === 0) {
      return new Response(
        JSON.stringify({
          results: [],
          message: 'No knowledge found for this agent',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate similarities and rank results
    const scoredResults = knowledgeItems
      .map(item => {
        try {
          const embedding = JSON.parse(item.embedding || '[]');
          const similarity = cosineSimilarity(queryEmbedding, embedding);
          return {
            ...item,
            similarity,
          };
        } catch (e) {
          console.warn('Failed to parse embedding for item:', item.id);
          return {
            ...item,
            similarity: 0,
          };
        }
      })
      .filter(item => item.similarity > 0.1) // Filter out very low similarity results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`✅ Found ${scoredResults.length} relevant results`);

    return new Response(
      JSON.stringify({
        results: scoredResults,
        query,
        totalResults: scoredResults.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Query failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});