import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RelationshipRequest {
  deliberationId: string;
  content: string;
  title: string;
  nodeType: string;
  includeAllTypes?: boolean;
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
    const { deliberationId, content, title, nodeType, includeAllTypes = false }: RelationshipRequest = await req.json();

    console.log('[relationship_evaluator] Processing request', { deliberationId, title, nodeType, includeAllTypes });

    // Get existing IBIS nodes from the deliberation
    let query = supabase
      .from('ibis_nodes')
      .select('id, title, description, node_type')
      .eq('deliberation_id', deliberationId);

    if (!includeAllTypes) {
      // Filter to complementary node types for relationships
      const targetTypes = nodeType === 'issue' ? ['position', 'argument'] :
                         nodeType === 'position' ? ['issue', 'argument'] :
                         ['issue', 'position'];
      query = query.in('node_type', targetTypes);
    }

    const { data: existingNodes, error: selectError } = await query.limit(20);
    if (selectError) throw selectError;

    if (!existingNodes || existingNodes.length === 0) {
      console.log('[relationship_evaluator] No existing nodes found');
      return new Response(JSON.stringify({ 
        success: true, 
        relationships: [],
        message: 'No existing nodes to evaluate relationships with'
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Create prompt for AI to evaluate relationships
    const nodesList = existingNodes.map(node => 
      `ID: ${node.id}, Type: ${node.node_type}, Title: "${node.title}", Description: "${node.description || 'None'}"`
    ).join('\n');

    const systemPrompt = `You are an IBIS (Issue-Based Information System) relationship analyzer. 
Given a new ${nodeType} and existing IBIS nodes, identify potential relationships.

IBIS Relationship Types:
- Issues can be "responded-to-by" Positions
- Positions can be "supported-by" or "objected-to-by" Arguments  
- Arguments can "support" or "object-to" Positions
- Issues can be "generalized-by" or "specialized-by" other Issues
- Positions can be "generalized-by" or "specialized-by" other Positions

Return a JSON array of relationships where confidence > 0.6:
[{"id": "node_id", "type": "relationship_type", "confidence": 0.8, "reasoning": "brief explanation"}]

Only suggest meaningful, substantive relationships. Be selective.`;

    const userPrompt = `New ${nodeType}:
Title: "${title}"
Content: "${content}"

Existing nodes in deliberation:
${nodesList}

Analyze and return potential relationships as JSON:`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[relationship_evaluator] OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const result = await openaiResponse.json();
    const aiResponse = result.choices[0].message.content;

    console.log('[relationship_evaluator] AI response:', aiResponse);

    // Parse the JSON response
    let relationships = [];
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        relationships = JSON.parse(jsonMatch[0]);
      } else {
        relationships = JSON.parse(aiResponse);
      }
    } catch (parseError) {
      console.error('[relationship_evaluator] Failed to parse AI response:', parseError);
      relationships = [];
    }

    // Validate and filter relationships
    const validRelationships = relationships
      .filter(rel => rel.id && rel.type && rel.confidence && rel.confidence > 0.6)
      .filter(rel => existingNodes.some(node => node.id === rel.id))
      .slice(0, 10); // Limit to top 10

    console.log(`[relationship_evaluator] Found ${validRelationships.length} valid relationships`);

    return new Response(JSON.stringify({ 
      success: true, 
      relationships: validRelationships,
      processedNodes: existingNodes.length
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('[relationship_evaluator] Function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      relationships: []
    }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});