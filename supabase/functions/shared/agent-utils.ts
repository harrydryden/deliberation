// Shared utilities for agent functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const MODEL = "claude-3-5-sonnet-20241022";

export interface AgentContext {
  message_id: string;
  content: string;
  user_id: string;
  input_type?: string;
  session_state?: any;
}

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
}

export async function getRecentMessages(supabase: any, userId: string, limit: number = 10) {
  const { data } = await supabase
    .from('messages')
    .select('content, message_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data?.reverse().map(m => `[${m.message_type}]: ${m.content}`).join('\n') || '';
}

export async function getAgentConfig(supabase: any, agentType: string) {
  const { data } = await supabase
    .from('agent_configurations')
    .select('*')
    .eq('agent_type', agentType)
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  return data;
}

export async function searchKnowledge(supabase: any, agentConfigId: string, content: string) {
  if (!agentConfigId) return '';

  try {
    const { data: knowledgeResults } = await supabase.functions.invoke('search-knowledge', {
      body: {
        query: content,
        agentId: agentConfigId,
        limit: 3
      }
    });

    if (knowledgeResults?.results && knowledgeResults.results.length > 0) {
      return `\n\nRELEVANT KNOWLEDGE:\n${knowledgeResults.results.map((item: any, index: number) => 
        `[${index + 1}] ${item.title}: ${item.content.substring(0, 500)}...`
      ).join('\n\n')}\n\n`;
    }
  } catch (error) {
    console.log('Knowledge search failed, continuing without:', error);
  }

  return '';
}

export async function callAnthropicAPI(anthropicKey: string, prompt: string, maxTokens: number = 1000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic API error:', errorText);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

export async function saveAgentMessage(supabase: any, content: string, userId: string, messageType: string) {
  const { error } = await supabase
    .from('messages')
    .insert({
      content,
      user_id: userId,
      message_type: messageType
    });

  if (error) {
    console.error('Database insert error:', error);
    throw error;
  }
}

export function buildSystemPrompt(agentConfig: any, defaultPrompt: string, inputType?: string, sessionState?: any) {
  let systemPrompt = agentConfig?.system_prompt || defaultPrompt;

  // Enhance system prompt based on input type
  if (inputType === 'QUESTION') {
    systemPrompt += `

QUESTION HANDLING:
- Provide factual, balanced information
- Acknowledge multiple perspectives when relevant
- Base responses on verified information from knowledge base
- Keep responses informative but concise (2-3 paragraphs)`;
  } else if (inputType === 'STATEMENT') {
    const responseType = sessionState?.statementCount % 2 === 0 ? 'supportive' : 'counter';
    systemPrompt += `

STATEMENT HANDLING:
- Analyze the stance and underlying arguments
- Provide a ${responseType} perspective
- Reference relevant knowledge from the knowledge base
- Maintain respectful and constructive tone
- Focus on substance and evidence`;
  }

  return systemPrompt;
}