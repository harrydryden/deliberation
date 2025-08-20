import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Streaming response handler for real-time agent responses
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageId, deliberationId, mode } = await req.json();
    
    console.log('🚀 Starting streaming agent orchestration', { messageId, deliberationId, mode });

    // Create streaming response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send data function
    const sendData = (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message));
    };

    // Start background processing
    processStreamingOrchestration(messageId, deliberationId, mode, sendData).finally(() => {
      writer.close();
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('❌ Streaming orchestration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processStreamingOrchestration(
  messageId: string,
  deliberationId: string,
  mode: string,
  sendData: (data: any) => void
) {
  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get message details
    const { data: message } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!message) {
      throw new Error('Message not found');
    }

    console.log('📨 Processing message:', message.content);

    // Check response cache first
    const cachedResponse = checkResponseCache(message.content, deliberationId);
    if (cachedResponse) {
      console.log('🚀 Using cached response');
      
      sendData({ 
        agentType: cachedResponse.agentType,
        content: cachedResponse.response,
        done: true,
        cached: true
      });
      return;
    }

    // Enhanced fast path - only for highest confidence patterns
    const fastPath = checkFastPath(message.content);
    if (fastPath && fastPath.confidence >= 0.95) {
      console.log('🚀 Using high-confidence fast path:', fastPath.agent, `(confidence: ${fastPath.confidence})`);
      
      const response = await generateFastResponse(
        message.content,
        fastPath,
        openAIApiKey,
        sendData
      );

      // Cache the response
      cacheResponse(message.content, response, fastPath.agent, deliberationId);

      // Store response
      await supabase.from('messages').insert({
        content: response,
        message_type: fastPath.agent,
        user_id: message.user_id,
        deliberation_id: deliberationId,
        agent_context: { 
          agent_type: fastPath.agent,
          processing_method: 'high_confidence_fast_path',
          confidence: fastPath.confidence 
        }
      });

      sendData({ done: true });
      return;
    } else if (fastPath) {
      console.log('🔍 Fast path matched but confidence too low, proceeding to full analysis:', 
        fastPath.agent, `(confidence: ${fastPath.confidence})`);
    }

    // Check mode first - if learn mode, force bill agent
    if (mode === 'learn') {
      console.log('🎓 Learn mode detected - forcing Bill agent');
      
      sendData({ 
        agentType: 'bill_agent',
        content: '',
        done: false 
      });

      const response = await generateStreamingResponse(
        message.content,
        'bill_agent',
        { intent: 'policy_question', complexity: 0.8, requiresExpertise: true },
        { messageCount: 1 },
        [],
        deliberationId,
        openAIApiKey,
        sendData
      );

      // Store response
      await supabase.from('messages').insert({
        content: response,
        message_type: 'bill_agent',
        user_id: message.user_id,
        deliberation_id: deliberationId,
        agent_context: { 
          agent_type: 'bill_agent',
          processing_method: 'mode_forced',
          mode: 'learn'
        }
      });

      sendData({ done: true });
      return;
    }

    // Full orchestration with parallel processing
    console.log('🔄 Using full orchestration');
    
    const analysisPromise = analyzeMessage(message.content, openAIApiKey);
    const conversationPromise = getConversationState(supabase, deliberationId, message.user_id);
    const similarNodesPromise = findSimilarNodes(supabase, message.content);

    // Wait for all parallel operations
    const [analysis, conversationState, similarNodes] = await Promise.all([
      analysisPromise,
      conversationPromise,
      similarNodesPromise
    ]);

    console.log('📊 Analysis complete, selecting agent...');

    // Select best agent
    const selectedAgent = selectOptimalAgent(analysis, conversationState, similarNodes);
    
    sendData({ 
      agentType: selectedAgent,
      content: '',
      done: false
    });

    // Generate streaming response
    const response = await generateStreamingResponse(
      message.content,
      selectedAgent,
      analysis,
      conversationState,
      similarNodes,
      deliberationId,
      openAIApiKey,
      sendData
    );

    // Cache the final response
    cacheResponse(message.content, response, selectedAgent, deliberationId);

    // Store final response
    await supabase.from('messages').insert({
      content: response,
      message_type: selectedAgent,
      user_id: message.user_id,
      deliberation_id: deliberationId,
      agent_context: { 
        agent_type: selectedAgent,
        processing_method: 'full_orchestration',
        analysis 
      }
    });

    sendData({ done: true });

  } catch (error) {
    console.error('❌ Streaming processing error:', error);
    sendData({ error: error.message, done: true });
  }
}

// Enhanced fast path pattern matching with higher confidence threshold
function checkFastPath(content: string): { agent: string; confidence: number; template?: string } | null {
  const patterns = [
    // Only very specific patterns with high confidence
    {
      regex: /^(what|which|how many|list)\s+(countries|nations|jurisdictions)\s+(have|allow|permit|legalized|legalised)\s+(assisted dying|euthanasia|MAID)/i,
      agent: 'bill_agent',
      confidence: 0.98
    },
    {
      regex: /^what\s+(specific\s+)?(safeguards|protections|requirements|criteria)\s+(are|exist|in place)/i,
      agent: 'bill_agent', 
      confidence: 0.97
    },
    {
      regex: /^(what did|what have|have any)\s+(other\s+)?(participants|people|users)\s+(said|mentioned|shared|contributed)/i,
      agent: 'peer_agent',
      confidence: 0.96
    },
    // Removed lower confidence patterns to force more analysis
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(content)) {
      console.log(`🎯 High-confidence fast path: "${content}" -> ${pattern.agent} (confidence: ${pattern.confidence})`);
      return {
        agent: pattern.agent,
        confidence: pattern.confidence
      };
    }
  }

  return null;
}

// Generate fast response using templates and simple AI
async function generateFastResponse(
  content: string,
  fastPath: any,
  openAIApiKey: string,
  sendData: (data: any) => void
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a ${fastPath.agent} providing a quick, helpful response. Be concise but informative.`
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
      stream: true
    }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
      
      for (const line of lines) {
        if (line.includes('[DONE]')) continue;
        
        try {
          const data = JSON.parse(line.slice(6));
          const content = data.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            sendData({ content, done: false });
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return fullResponse;
}

// Enhanced message analysis with error handling
async function analyzeMessage(content: string, openAIApiKey: string): Promise<{
  intent: string;
  complexity: number;
  topicRelevance: number;
  requiresExpertise: boolean;
}> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Analyze this message and return JSON with: intent, complexity (0-1), topicRelevance (0-1), requiresExpertise (boolean). Focus on policy, legal, participant, or clarification intents.'
          },
          {
            role: 'user',
            content: content
          }
        ],
        max_tokens: 150,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const analysisContent = data.choices?.[0]?.message?.content;
    
    if (!analysisContent) {
      throw new Error('No analysis content received');
    }

    return JSON.parse(analysisContent);
  } catch (error) {
    console.error('❌ Message analysis failed:', error);
    // Return safe defaults
    return { 
      intent: 'general', 
      complexity: 0.5, 
      topicRelevance: 0.5, 
      requiresExpertise: false 
    };
  }
}

// Get conversation state
async function getConversationState(supabase: any, deliberationId: string, userId: string): Promise<any> {
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('deliberation_id', deliberationId)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    messageCount: messages?.length || 0,
    recentMessages: messages || []
  };
}

// Find similar IBIS nodes
async function findSimilarNodes(supabase: any, content: string): Promise<any[]> {
  // Simplified - would normally use embedding similarity
  const { data: nodes } = await supabase
    .from('ibis_nodes')
    .select('*')
    .limit(5);

  return nodes || [];
}

// Enhanced agent selection with sophisticated weighting algorithm
function selectOptimalAgent(analysis: any, conversationState: any, similarNodes: any[]): string {
  const scores = {
    bill_agent: 0,
    peer_agent: 0,
    flow_agent: 0
  };

  // Base scoring factors
  const factors = {
    complexity: analysis.complexity || 0.5,
    requiresExpertise: analysis.requiresExpertise || false,
    intent: analysis.intent || 'general',
    topicRelevance: analysis.topicRelevance || 0.5,
    messageCount: conversationState.messageCount || 0,
    recentMessageTypes: getRecentMessageTypes(conversationState.recentMessages || []),
    similarNodesCount: similarNodes.length
  };

  // Bill Agent scoring
  scores.bill_agent += factors.complexity * 40; // High weight for complexity
  scores.bill_agent += factors.requiresExpertise ? 30 : 0;
  scores.bill_agent += factors.topicRelevance * 25;
  scores.bill_agent += factors.intent.includes('policy') ? 20 : 0;
  scores.bill_agent += factors.intent.includes('legal') ? 20 : 0;
  scores.bill_agent += factors.intent.includes('legislation') ? 25 : 0;

  // Peer Agent scoring
  scores.peer_agent += factors.messageCount > 5 ? 20 : 0; // Needs conversation history
  scores.peer_agent += factors.similarNodesCount * 15; // Similar discussions boost relevance
  scores.peer_agent += factors.intent.includes('participant') ? 25 : 0;
  scores.peer_agent += factors.intent.includes('perspective') ? 20 : 0;
  scores.peer_agent += getRecentBillAgentCount(factors.recentMessageTypes) > 2 ? 15 : 0; // Balance after bill agent responses

  // Flow Agent scoring  
  scores.flow_agent += factors.messageCount < 3 ? 25 : 0; // Good for early conversation
  scores.flow_agent += factors.intent.includes('question') ? 20 : 0;
  scores.flow_agent += factors.intent.includes('clarify') ? 25 : 0;
  scores.flow_agent += factors.complexity < 0.3 ? 15 : 0; // Simple queries
  scores.flow_agent += getRecentFlowAgentCount(factors.recentMessageTypes) === 0 ? 10 : 0; // Avoid repetition

  // Diversity bonus - avoid same agent repeatedly
  const lastAgentType = getLastAgentType(factors.recentMessageTypes);
  if (lastAgentType) {
    scores[lastAgentType as keyof typeof scores] -= 10;
  }

  // Select agent with highest score
  const selectedAgent = Object.entries(scores).reduce((max, [agent, score]) => 
    score > max.score ? { agent, score } : max, 
    { agent: 'flow_agent', score: -1 }
  ).agent;

  console.log(`🔬 Agent scoring results:`, {
    scores,
    factors,
    selected: selectedAgent
  });

  return selectedAgent;
}

// Helper functions for agent selection
function getRecentMessageTypes(messages: any[]): string[] {
  return messages.slice(0, 5).map(m => m.message_type || 'unknown');
}

function getRecentBillAgentCount(messageTypes: string[]): number {
  return messageTypes.filter(type => type === 'bill_agent').length;
}

function getRecentFlowAgentCount(messageTypes: string[]): number {
  return messageTypes.filter(type => type === 'flow_agent').length;
}

function getLastAgentType(messageTypes: string[]): string | null {
  return messageTypes.find(type => type !== 'user') || null;
}

// Generate streaming response with full context
async function generateStreamingResponse(
  content: string,
  agentType: string,
  analysis: any,
  conversationState: any,
  similarNodes: any[],
  deliberationId: string,
  openAIApiKey: string,
  sendData: (data: any) => void
): Promise<string> {
  // Determine model based on complexity
  const model = analysis.complexity > 0.8 ? 'gpt-5-2025-08-07' : 'gpt-4o-mini';
  const isGPT5 = model === 'gpt-5-2025-08-07';
  
  console.log(`🧠 Using ${model} for ${agentType} response`);

  const systemPrompt = await buildSystemPrompt(agentType, analysis, conversationState, similarNodes);

  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ],
    stream: true
  };

  // Set appropriate parameters based on model
  if (isGPT5) {
    requestBody.max_completion_tokens = 1500;
    // No temperature for GPT-5
  } else {
    requestBody.max_tokens = 1000;
    requestBody.temperature = 0.7;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
      
      for (const line of lines) {
        if (line.includes('[DONE]')) continue;
        
        try {
          const data = JSON.parse(line.slice(6));
          const content = data.choices?.[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            sendData({ content, done: false });
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return fullResponse;
}

// Build appropriate system prompt using configurable prompts
async function buildSystemPrompt(agentType: string, analysis: any, conversationState: any, similarNodes: any[]): Promise<string> {
  // Try to get prompt from database first
  let prompt = await getPromptFromDatabase(agentType, 'system_prompt');
  
  if (!prompt) {
    // Fallback to hardcoded prompts
    const basePrompts = {
      bill_agent: "You are a knowledgeable assistant focused on legislation, policy, and legal frameworks around assisted dying. Provide accurate, factual information.",
      peer_agent: "You are a facilitator helping users understand what other participants have contributed to this discussion. Share relevant perspectives and contributions.",
      flow_agent: "You are a conversation facilitator helping guide productive discussions about assisted dying. Ask thoughtful questions and help clarify complex topics."
    };
    prompt = basePrompts[agentType as keyof typeof basePrompts] || basePrompts.flow_agent;
  }

  if (analysis.complexity > 0.7) {
    prompt += " This is a complex query requiring detailed analysis and nuanced understanding.";
  }

  if (similarNodes.length > 0) {
    prompt += ` There are ${similarNodes.length} related discussion points that may be relevant to reference.`;
  }

  return prompt;
}

// Get prompt from database
async function getPromptFromDatabase(agentType: string, promptType: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from('prompt_templates')
      .select('template')
      .eq('prompt_type', promptType)
      .eq('agent_type', agentType)
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    return data?.template || null;
  } catch (error) {
    console.error('Failed to get prompt from database:', error);
    return null;
  }
}

// Enhanced response cache with cleanup
interface CacheEntry {
  response: string;
  agentType: string;
  timestamp: number;
  hits: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
const MAX_CACHE_SIZE = 1000; // Prevent memory leaks

function checkResponseCache(content: string, deliberationId?: string): CacheEntry | null {
  const key = `${deliberationId || 'global'}:${content.toLowerCase().trim()}`;
  const cached = responseCache.get(key);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    cached.hits++;
    return cached;
  }
  
  // Remove expired entry if found
  if (cached) {
    responseCache.delete(key);
  }
  
  return null;
}

function cacheResponse(content: string, response: string, agentType: string, deliberationId?: string): void {
  // Clean up cache if it's getting too large
  if (responseCache.size >= MAX_CACHE_SIZE) {
    cleanupCache();
  }
  
  const key = `${deliberationId || 'global'}:${content.toLowerCase().trim()}`;
  responseCache.set(key, {
    response,
    agentType,
    timestamp: Date.now(),
    hits: 0
  });
}

function cleanupCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  // Remove expired entries
  for (const [key, entry] of responseCache.entries()) {
    if ((now - entry.timestamp) > CACHE_DURATION) {
      keysToDelete.push(key);
    }
  }
  
  // If still too many, remove least recently used
  if (responseCache.size - keysToDelete.length > MAX_CACHE_SIZE) {
    const sortedEntries = Array.from(responseCache.entries())
      .filter(([key]) => !keysToDelete.includes(key))
      .sort(([,a], [,b]) => a.timestamp - b.timestamp);
    
    const toRemove = sortedEntries.slice(0, 200); // Remove oldest 200
    keysToDelete.push(...toRemove.map(([key]) => key));
  }
  
  keysToDelete.forEach(key => responseCache.delete(key));
  console.log(`🧹 Cleaned up cache: removed ${keysToDelete.length} entries`);
}