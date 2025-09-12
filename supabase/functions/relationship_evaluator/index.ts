import { serve } from "std/http/server.ts";
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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

    const { sourceNodeId, targetNodeId, deliberationId } = await parseAndValidateRequest(req, [
      'sourceNodeId', 'targetNodeId', 'deliberationId'
    ]);

    const openaiKey = getOpenAIKey();
    const { supabase } = validateAndGetEnvironment();

    // Fetch the source and target nodes
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

    // Call OpenAI API for relationship evaluation
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
  "relationship": "supports|objects|questions|responds|generalizes|specializes|temporal_sequence|replaces",
  "confidence": 0.85,
  "reasoning": "Brief explanation"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    // Parse the JSON response
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Failed to parse OpenAI response: ${content}`);
    }

    console.log('Relationship evaluation completed successfully');

    return createSuccessResponse({
      sourceNodeId,
      targetNodeId,
      relationship: result.relationship,
      confidence: result.confidence,
      reasoning: result.reasoning,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return createErrorResponse(error, 500, 'relationship_evaluator');
  }
});