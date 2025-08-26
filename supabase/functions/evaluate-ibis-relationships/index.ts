import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.52.6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  deliberationId: string;
  content: string;
  title: string;
  nodeType: "issue" | "position" | "argument";
  notion?: string;
  includeAllTypes?: boolean;
}

interface RelationshipSuggestion {
  nodeId: string;
  nodeTitle: string;
  nodeType: string;
  relationshipType: string;
  confidence: number;
  reasoning: string;
  semanticSimilarity: number;
}

// Enhanced relationship types mapping
const RELATIONSHIP_TYPES = {
  // Issue relationships
  'issue_to_issue': ['relates_to', 'causes', 'blocks', 'depends_on'],
  'position_to_issue': ['responds_to', 'addresses', 'solves'],
  'argument_to_issue': ['discusses', 'exemplifies', 'challenges'],
  
  // Position relationships  
  'position_to_position': ['supports', 'opposes', 'alternative_to', 'builds_on'],
  'issue_to_position': ['motivates', 'requires'],
  'argument_to_position': ['supports', 'opposes', 'questions', 'refines'],
  
  // Argument relationships
  'argument_to_argument': ['supports', 'counters', 'strengthens', 'contradicts'],
  'issue_to_argument': ['necessitates', 'contextualizes'],
  'position_to_argument': ['justifies', 'requires_defense_from']
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { deliberationId, content, title, nodeType, notion, includeAllTypes = true } = body;
    
    if (!deliberationId || !content || !nodeType) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    
    if (!openaiKey) {
      return new Response(JSON.stringify({ success: false, error: "OPENAI_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // Get deliberation context
    const { data: deliberation } = await supabase
      .from("deliberations")
      .select("title, description, notion")
      .eq("id", deliberationId)
      .single();

    // Fetch existing nodes with embeddings
    const nodeTypesToFetch = includeAllTypes 
      ? ['issue', 'position', 'argument']
      : [nodeType];
    
    const { data: existingNodes, error: nodesError } = await supabase
      .from("ibis_nodes")
      .select("id, title, description, node_type, embedding")
      .eq("deliberation_id", deliberationId)
      .in("node_type", nodeTypesToFetch)
      .not("embedding", "is", null)
      .limit(100);

    if (nodesError) throw nodesError;
    if (!existingNodes?.length) {
      return new Response(JSON.stringify({ 
        success: true, 
        relationships: [],
        message: "No existing nodes found for relationship evaluation"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embedding for new content
    const openai = new OpenAI({ apiKey: openaiKey });
    const fullContent = `${title}\n\n${content}`;
    
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: fullContent.slice(0, 8000),
    });
    
    const newContentEmbedding = embedRes.data[0]?.embedding as number[];

    // Calculate semantic similarities
    const semanticMatches = existingNodes
      .map(node => ({
        ...node,
        semanticSimilarity: cosineSimilarity(newContentEmbedding, node.embedding as number[])
      }))
      .filter(node => node.semanticSimilarity > 0.3)
      .sort((a, b) => b.semanticSimilarity - a.semanticSimilarity)
      .slice(0, 10);

    if (semanticMatches.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        relationships: [],
        message: "No semantically similar nodes found"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to determine relationship types and confidence
    const relationshipPrompt = `
Context: This is a democratic deliberation about "${deliberation?.title || 'Unknown Topic'}".
${deliberation?.notion ? `Key Question: ${deliberation.notion}` : ''}

New Contribution:
Type: ${nodeType}
Title: ${title}
Content: ${content}

Evaluate relationships with these existing contributions:
${semanticMatches.map((node, i) => `
${i + 1}. [${node.node_type.toUpperCase()}] ${node.title}
   ${node.description || 'No description'}
`).join('\n')}

For each existing contribution that has a meaningful relationship, provide:
1. Relationship type: ${RELATIONSHIP_TYPES[`${nodeType}_to_issue` as keyof typeof RELATIONSHIP_TYPES]?.join(', ')} or ${RELATIONSHIP_TYPES[`${nodeType}_to_position` as keyof typeof RELATIONSHIP_TYPES]?.join(', ')} or ${RELATIONSHIP_TYPES[`${nodeType}_to_argument` as keyof typeof RELATIONSHIP_TYPES]?.join(', ')}
2. Confidence score (0.0-1.0)
3. Brief reasoning (1 sentence)

Only suggest relationships with confidence > 0.6. Focus on logical and argumentative relationships, not just topical similarity.

Respond in JSON format:
{
  "relationships": [
    {
      "nodeIndex": number,
      "relationshipType": "string", 
      "confidence": number,
      "reasoning": "string"
    }
  ]
}`;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { 
          role: "system", 
          content: "You are an expert in argument analysis and democratic deliberation. Analyze logical relationships between contributions accurately." 
        },
        { role: "user", content: relationshipPrompt }
      ],
      max_tokens: 1500,
      temperature: 0.3
    });

    let aiRelationships: any[] = [];
    try {
      const aiResult = JSON.parse(aiResponse.choices[0]?.message?.content || '{"relationships": []}');
      aiRelationships = aiResult.relationships || [];
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
    }

    // Combine AI analysis with semantic similarity
    const relationshipSuggestions: RelationshipSuggestion[] = aiRelationships
      .filter(rel => rel.nodeIndex > 0 && rel.nodeIndex <= semanticMatches.length)
      .map(rel => {
        const node = semanticMatches[rel.nodeIndex - 1];
        return {
          nodeId: node.id,
          nodeTitle: node.title,
          nodeType: node.node_type,
          relationshipType: rel.relationshipType,
          confidence: Math.min(rel.confidence * node.semanticSimilarity, 1.0), // Combine AI confidence with semantic similarity
          reasoning: rel.reasoning,
          semanticSimilarity: node.semanticSimilarity
        };
      })
      .filter(rel => rel.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    return new Response(JSON.stringify({ 
      success: true, 
      relationships: relationshipSuggestions,
      totalEvaluated: semanticMatches.length,
      deliberationContext: deliberation?.notion
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Enhanced relationship evaluation error:", err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: String(err),
      relationships: []
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});