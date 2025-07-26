// Peer agent specific utilities
import { callAnthropicAPI } from './agent-utils.ts';

export async function findRelevantPeerPerspectives(query: string, peerStatements: any[], anthropicKey: string) {
  if (!peerStatements || peerStatements.length === 0) return [];
  
  try {
    // Use semantic similarity to find relevant perspectives
    const relevancePromises = peerStatements.slice(0, 10).map(async (statement) => {
      const relevancePrompt = `Rate the semantic relevance between these texts (0-1):

Query: "${query}"
Statement: "${statement.content}"

Respond with only a decimal number.`;

      try {
        const relevanceScore = await callAnthropicAPI(anthropicKey, relevancePrompt, 10);
        const relevance = parseFloat(relevanceScore.trim());
        return { ...statement, relevance: isNaN(relevance) ? 0 : relevance };
      } catch (error) {
        return { ...statement, relevance: 0 };
      }
    });

    const scoredStatements = await Promise.all(relevancePromises);
    return scoredStatements
      .filter(s => s.relevance > 0.7)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 2);
  } catch (error) {
    console.error('Error finding relevant perspectives:', error);
    return [];
  }
}

export async function getPeerStatements(supabase: any, userId: string, limit: number = 50) {
  const { data } = await supabase
    .from('messages')
    .select('content, created_at')
    .eq('message_type', 'user')
    .neq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

export async function getIbisNodes(supabase: any, userId: string, limit: number = 20) {
  const { data } = await supabase
    .from('ibis_nodes')
    .select(`
      title,
      description,
      node_type,
      created_at,
      messages!inner(user_id)
    `)
    .eq('messages.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

export function buildIbisContext(ibisNodes: any[]): string {
  return ibisNodes?.length ? 
    `PREVIOUS STATEMENTS AND ARGUMENTS FROM IBIS KNOWLEDGE BASE:
${ibisNodes.map(node => `[${node.node_type.toUpperCase()}] ${node.title}: ${node.description}`).join('\n\n')}

` : '';
}

export function buildPeerContext(relevantPeerPerspectives: any[]): string {
  return relevantPeerPerspectives.length > 0 ? 
    `RELEVANT PEER PERSPECTIVES:
${relevantPeerPerspectives.map((p, i) => `Perspective ${i + 1}: ${p.content}`).join('\n\n')}

` : '';
}