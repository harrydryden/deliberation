import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use Anthropic to find relevant knowledge chunks
async function findRelevantKnowledge(query: string, knowledge: any[], limit: number) {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  // First, do basic text matching for quick filtering
  const queryWords = query.toLowerCase().split(/\s+/);
  
  // Score knowledge chunks based on keyword overlap and content relevance
  const scoredKnowledge = knowledge.map((item, index) => {
    let score = 0;
    const itemText = (item.title + ' ' + item.content + ' ' + (item.metadata?.keywords?.join(' ') || '')).toLowerCase();
    
    // Basic keyword matching
    queryWords.forEach(word => {
      if (itemText.includes(word)) {
        score += 1;
      }
    });
    
    // Keyword matching from metadata
    if (item.metadata?.keywords) {
      item.metadata.keywords.forEach((keyword: string) => {
        queryWords.forEach(word => {
          if (keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase())) {
            score += 2; // Higher weight for metadata keywords
          }
        });
      });
    }
    
    return { ...item, relevanceScore: score, originalIndex: index };
  });
  
  // Filter and sort by relevance
  const relevantItems = scoredKnowledge
    .filter(item => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, Math.min(limit * 2, 10)); // Get more candidates for AI filtering
  
  if (relevantItems.length === 0) {
    return [];
  }
  
  // If we have many candidates and Anthropic is available, use it to select the most relevant ones
  if (relevantItems.length > limit && anthropicKey) {
    try {
      const candidates = relevantItems.map((item, idx) => ({
        index: idx,
        title: item.title,
        summary: item.metadata?.summary || item.content.substring(0, 200) + '...'
      }));
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: `Given this search query: "${query}"

Please select the ${limit} most relevant knowledge chunks from these candidates:

${candidates.map(c => `${c.index}: ${c.title} - ${c.summary}`).join('\n')}

Respond with only the indices of the most relevant chunks, separated by commas (e.g., "0,2,4").`
            }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const selectedIndices = data.content[0].text
          .split(',')
          .map((idx: string) => parseInt(idx.trim()))
          .filter((idx: number) => !isNaN(idx) && idx < relevantItems.length);
        
        if (selectedIndices.length > 0) {
          return selectedIndices.map(idx => relevantItems[idx]).slice(0, limit);
        }
      }
    } catch (error) {
      console.error('Anthropic selection error:', error);
      // Fall back to score-based selection
    }
  }
  
  return relevantItems.slice(0, limit);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, agentId, limit = 5 } = await req.json();

    console.log('Searching knowledge:', { query, agentId, limit });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all knowledge for the agent
    const { data: allKnowledge, error: fetchError } = await supabase
      .from('agent_knowledge')
      .select('*')
      .eq('agent_id', agentId);

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      throw fetchError;
    }

    if (!allKnowledge || allKnowledge.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [],
          message: 'No knowledge found for this agent'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use text-based search with Anthropic assistance
    const relevantKnowledge = await findRelevantKnowledge(query, allKnowledge, limit);

    return new Response(
      JSON.stringify({ 
        results: relevantKnowledge,
        total: allKnowledge.length,
        found: relevantKnowledge.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-knowledge function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});