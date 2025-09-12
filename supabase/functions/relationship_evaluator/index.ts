import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import OpenAI from "npm:openai@4.52.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function handleCORSPreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] ${context || 'relationship_evaluator error'}:`, error);
  
  return new Response(
    JSON.stringify({ 
      error: error?.message || 'Internal server error', 
      errorId,
      timestamp: new Date().toISOString()
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status 
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  );
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  if (request.method !== 'POST') {
    throw new Error(`Method ${request.method} not allowed`);
  }

  const body = await request.json();
  
  for (const field of requiredFields) {
    if (!(field in body) || body[field] === undefined || body[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return body as T;
}

function getOpenAIKey(): string {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }
  return apiKey;
}

function validateAndGetEnvironment() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  return { supabase };
}

serve(async (req) => {
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('Relationship evaluator request received');

    const body = await parseAndValidateRequest(req, ['deliberationId']);
    const { deliberationId, sourceNodeId, targetNodeId, content, title, nodeType, includeAllTypes } = body;

    const openaiKey = getOpenAIKey();
    const { supabase } = validateAndGetEnvironment();

    // Handle two different use cases:
    // 1. Evaluate relationship between two specific existing nodes (legacy)
    // 2. Find relationships for new content against existing nodes (new)
    
    if (sourceNodeId && targetNodeId) {
      // Legacy use case: evaluate relationship between two existing nodes
      const { data: nodes, error: nodesError } = await supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type')
        .in('id', [sourceNodeId, targetNodeId]);

      if (nodesError) {
        throw new Error(`Failed to fetch nodes: ${nodesError.message}`);
      }

      if (!nodes || nodes.length !== 2) {
        throw new Error('Could not find both source and target nodes');
      }

      const sourceNode = nodes.find(n => n.id === sourceNodeId);
      const targetNode = nodes.find(n => n.id === targetNodeId);

      if (!sourceNode || !targetNode) {
        throw new Error('Could not identify source and target nodes');
      }

      const openai = new OpenAI({ apiKey: openaiKey });
      
      const systemPrompt = "You are an expert in IBIS (Issue-Based Information System) methodology. Analyze the relationship between two IBIS nodes and suggest the most appropriate relationship type.";
      
      const userPrompt = `Analyze the relationship between these IBIS nodes:

Source Node (${sourceNode.node_type}): ${sourceNode.title}
Description: ${sourceNode.description || 'N/A'}

Target Node (${targetNode.node_type}): ${targetNode.title}  
Description: ${targetNode.description || 'N/A'}

Determine the most appropriate relationship type and provide a confidence score (0-1).

Respond with ONLY a JSON object in this format:
{
  "relationship": "supports|opposes|relates_to|responds_to",
  "confidence": [rate from 0.0 to 1.0 based on your actual assessment],
  "reasoning": "Brief explanation"
}

Rate confidence naturally based on evidence strength, typically ranging 0.65-0.95.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      });

      const responseContent = response.choices?.[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI');
      }

      let result;
      try {
        result = JSON.parse(responseContent);
      } catch (parseError) {
        throw new Error(`Failed to parse OpenAI response: ${responseContent}`);
      }

      return createSuccessResponse({
        sourceNodeId,
        targetNodeId,
        relationship: result.relationship,
        confidence: result.confidence,
        reasoning: result.reasoning,
        timestamp: new Date().toISOString()
      });
    } else if (content || title) {
      // New use case: find relationships for new content against existing nodes
      if (!title) {
        throw new Error('Missing required field: title');
      }

      // Compute embedding for the new content and find similar existing nodes using DB vector search
      const openai = new OpenAI({ apiKey: openaiKey });

      const queryText = `${title}\n\n${content || ''}`.slice(0, 2000);
      let queryEmbedding: number[] | null = null;
      try {
        const emb = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: queryText,
        });
        queryEmbedding = emb.data?.[0]?.embedding as number[];
      } catch (e) {
        console.warn('Failed to compute query embedding, will fall back to LLM-only analysis:', e);
      }

      let matchedNodes: Array<{ id: string; title: string; description: string | null; node_type: string; similarity: number }> = [];

      if (queryEmbedding) {
        // Try with default threshold (0.35), then fallback to lower threshold if needed
        let matches, matchError;
        
        const { data: primaryMatches, error: primaryError } = await supabase.rpc('match_ibis_nodes_for_query', {
          query_embedding: queryEmbedding,
          deliberation_uuid: deliberationId,
          match_threshold: 0.35,
          match_count: 12,
        });

        if (primaryError) {
          console.warn('Primary vector search failed, trying lower threshold:', primaryError);
          
          const { data: fallbackMatches, error: fallbackError } = await supabase.rpc('match_ibis_nodes_for_query', {
            query_embedding: queryEmbedding,
            deliberation_uuid: deliberationId,
            match_threshold: 0.2,
            match_count: 12,
          });
          
          matches = fallbackMatches;
          matchError = fallbackError;
        } else {
          matches = primaryMatches;
          matchError = primaryError;
        }

        if (matchError) {
          console.warn('match_ibis_nodes_for_query RPC failed, falling back to LLM-only analysis:', matchError);
        } else {
          matchedNodes = (matches || []).map((m: any) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            node_type: m.node_type,
            similarity: m.similarity,
          }));
        }
      }

      // If we couldn't get vector matches (e.g., embeddings missing), fall back to fetching recent nodes
      if (!matchedNodes.length) {
        const { data: existingNodes, error: nodesError } = await supabase
          .from('ibis_nodes')
          .select('id, title, description, node_type')
          .eq('deliberation_id', deliberationId)
          .order('created_at', { ascending: false })
          .limit(12);

        if (nodesError) {
          throw new Error(`Failed to fetch existing nodes: ${nodesError.message}`);
        }

        if (!existingNodes || existingNodes.length === 0) {
          return createSuccessResponse({
            success: true,
            relationships: [],
            message: 'No existing nodes to connect to'
          });
        }

        matchedNodes = existingNodes.map((n: any) => ({
          id: n.id,
          title: n.title,
          description: n.description,
          node_type: n.node_type,
          similarity: null, // null indicates no embedding-based similarity available
        }));
      }

      console.log(`[relationship_evaluator] Found ${matchedNodes.length} candidate nodes (vector match or fallback)`);
      console.log(`[relationship_evaluator] Embedding coverage: ${matchedNodes.filter(n => n.similarity !== null).length}/${matchedNodes.length} nodes have embeddings`);

      // Analyze relationships for the top candidates using the LLM
      const topCandidates = matchedNodes
        .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
        .slice(0, 8);

      console.log('[relationship_evaluator] Top candidate similarities:', topCandidates.map(n => ({ 
        id: n.id, 
        sim: n.similarity, 
        hasEmbedding: n.similarity !== null 
      })));

      const relationshipPromises = topCandidates.map(async (existingNode) => {
        const systemPrompt = `You are an expert in IBIS (Issue-Based Information System) methodology. Analyze if a meaningful relationship exists between a new node and an existing node. Only suggest relationships with confidence > 0.6.`;
        
        const userPrompt = `Analyze if there's a meaningful relationship between:\n\nNEW NODE (${nodeType}): "${title}"\nContent: ${content || 'No additional content'}\n\nEXISTING NODE (${existingNode.node_type}): "${existingNode.title}"\nDescription: ${existingNode.description || 'No description'}\n\nContext: A semantic search found this existing node as potentially related.${existingNode.similarity ? ` Semantic similarity (0-1): ${existingNode.similarity.toFixed(2)}.` : ''}\n\nDetermine if there's a meaningful relationship and suggest the most appropriate type.\nValid relationship types: supports, opposes, relates_to, responds_to\n\nRespond with ONLY a JSON object in this format:\n{\n  "hasRelationship": true/false,\n  "relationshipType": "supports|opposes|relates_to|responds_to",\n  "confidence": [rate from 0.0 to 1.0 based on your actual certainty],\n  "reasoning": "Brief explanation of why they're related"\n}\n\nInstructions for confidence scoring:\n- Base confidence on your reasoning quality and evidence, NOT on the semantic similarity score\n- Vary confidence naturally between 0.6-0.95 (two decimals), avoid reusing the same numbers\n- Only set hasRelationship to true if confidence is > 0.6 and there's a clear logical connection\n- Be honest about uncertainty - don't default to specific values`;

        try {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 200,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
          });

          const responseContent = response.choices?.[0]?.message?.content;
          if (!responseContent) return null;

          const result = JSON.parse(responseContent);
          
          if (result.hasRelationship && result.confidence > 0.6) {
            return {
              nodeId: existingNode.id,
              nodeTitle: existingNode.title,
              nodeType: existingNode.node_type,
              relationshipType: result.relationshipType,
              confidence: result.confidence,
              reasoning: result.reasoning,
              // Use the actual vector similarity score, not a calculated one
              semanticSimilarity: existingNode.similarity,
            };
          }
          
          return null;
        } catch (error) {
          console.warn(`Failed to analyze relationship with node ${existingNode.id}:`, error);
          return null;
        }
      });

      const results = await Promise.all(relationshipPromises);
      const validRelationships = results.filter((r): r is NonNullable<typeof r> => r !== null);

      // Sort by confidence and take top suggestions
      validRelationships.sort((a, b) => b.confidence - a.confidence);
      const topRelationships = validRelationships.slice(0, 5);

      console.log(`Found ${topRelationships.length} potential relationships (after LLM validation)`);

      return createSuccessResponse({
        success: true,
        relationships: topRelationships,
        totalAnalyzed: matchedNodes.length,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Must provide either (sourceNodeId + targetNodeId) or (title + content) for evaluation');
    }

  } catch (error) {
    return createErrorResponse(error, 500, 'relationship_evaluator');
  }
});