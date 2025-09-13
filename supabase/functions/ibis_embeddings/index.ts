import "xhr";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingRequest {
  deliberationId?: string;
  nodeId?: string;
  nodeType?: string;
  force?: boolean;
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
    const { deliberationId, nodeId, nodeType, force = false }: EmbeddingRequest = await req.json();

    console.log('[ibis_embeddings] Processing request', { deliberationId, nodeId, nodeType, force });

    let query = supabase
      .from('ibis_nodes')
      .select('id, title, description, node_type, embedding');

    if (nodeId) {
      query = query.eq('id', nodeId);
    } else if (deliberationId) {
      query = query.eq('deliberation_id', deliberationId);
      if (nodeType) {
        query = query.eq('node_type', nodeType);
      }
    } else {
      throw new Error('Either nodeId or deliberationId must be provided');
    }

    // Only process nodes without embeddings unless force is true
    if (!force) {
      query = query.is('embedding', null);
    }

    const { data: nodes, error: selectError } = await query;
    if (selectError) throw selectError;

    if (!nodes || nodes.length === 0) {
      console.log('[ibis_embeddings] No nodes to process');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No nodes requiring embedding updates',
        processed: 0 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`[ibis_embeddings] Processing ${nodes.length} nodes`);

    const embeddings = [];
    for (const node of nodes) {
      try {
        const text = `${node.title} ${node.description || ''}`.trim();
        
        const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
          }),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error(`[ibis_embeddings] OpenAI API error for node ${node.id}:`, errorText);
          continue;
        }

        const embeddingResult = await openaiResponse.json();
        const embedding = embeddingResult.data[0].embedding;

        // Update the node with its embedding
        const { error: updateError } = await supabase
          .from('ibis_nodes')
          .update({ embedding })
          .eq('id', node.id);

        if (updateError) {
          console.error(`[ibis_embeddings] Failed to update node ${node.id}:`, updateError);
          continue;
        }

        embeddings.push({ nodeId: node.id, success: true });
        console.log(`[ibis_embeddings] Generated embedding for node ${node.id}`);
      } catch (error) {
        console.error(`[ibis_embeddings] Error processing node ${node.id}:`, error);
        embeddings.push({ nodeId: node.id, success: false, error: error.message });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: embeddings.filter(e => e.success).length,
      total: nodes.length,
      embeddings 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('[ibis_embeddings] Function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});