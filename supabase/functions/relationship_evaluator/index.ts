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
  "confidence": 0.85,
  "reasoning": "Brief explanation"
}`;

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

      // Fetch existing nodes in the deliberation
      const { data: existingNodes, error: nodesError } = await supabase
        .from('ibis_nodes')
        .select('id, title, description, node_type')
        .eq('deliberation_id', deliberationId)
        .limit(20); // Limit to prevent too many API calls

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

      const openai = new OpenAI({ apiKey: openaiKey });

      // Analyze relationships with existing nodes
      const relationshipPromises = existingNodes.map(async (existingNode) => {
        const systemPrompt = `You are an expert in IBIS (Issue-Based Information System) methodology. Analyze if a meaningful relationship exists between a new node and an existing node. Only suggest relationships with confidence > 0.6.`;
        
        const userPrompt = `Analyze if there's a meaningful relationship between:

NEW NODE (${nodeType}): "${title}"
Content: ${content || 'No additional content'}

EXISTING NODE (${existingNode.node_type}): "${existingNode.title}"
Description: ${existingNode.description || 'No description'}

Determine if there's a meaningful relationship and suggest the most appropriate type.
Valid relationship types: supports, opposes, relates_to, responds_to

Respond with ONLY a JSON object in this format:
{
  "hasRelationship": true/false,
  "relationshipType": "supports|opposes|relates_to|responds_to",
  "confidence": 0.75,
  "reasoning": "Brief explanation of why they're related"
}

Only set hasRelationship to true if confidence is > 0.6 and there's a clear logical connection.`;

        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", 
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
              semanticSimilarity: result.confidence // Use confidence as similarity proxy
            };
          }
          
          return null;
        } catch (error) {
          console.warn(`Failed to analyze relationship with node ${existingNode.id}:`, error);
          return null;
        }
      });

      // Execute all relationship analyses in parallel
      const results = await Promise.all(relationshipPromises);
      const validRelationships = results.filter(r => r !== null);

      // Sort by confidence and take top suggestions
      validRelationships.sort((a, b) => b.confidence - a.confidence);
      const topRelationships = validRelationships.slice(0, 5);

      console.log(`Found ${topRelationships.length} potential relationships`);

      return createSuccessResponse({
        success: true,
        relationships: topRelationships,
        totalAnalyzed: existingNodes.length,
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Must provide either (sourceNodeId + targetNodeId) or (title + content) for evaluation');
    }

  } catch (error) {
    return createErrorResponse(error, 500, 'relationship_evaluator');
  }
});