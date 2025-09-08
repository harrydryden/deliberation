import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Import shared utilities for performance and consistency
import { 
  corsHeaders, 
  validateAndGetEnvironment, 
  createErrorResponse, 
  createSuccessResponse,
  handleCORSPreflight,
  getOpenAIKey,
  parseAndValidateRequest,
  createStreamingResponse,
  scheduleCleanup
} from '../shared/edge-function-utils.ts';
import { responseCache, configCache, createCacheKey } from '../shared/cache-manager.ts';
import { AgentOrchestrator } from '../shared/agent-orchestrator.ts';
import { ModelConfigManager } from '../shared/model-config.ts';

// Re-export types from shared orchestrator
import type { AgentConfig, AnalysisResult, ConversationContext } from '../shared/agent-orchestrator.ts';

// Helper function to get fast path system prompt from template with caching
async function getFastPathSystemPrompt(supabase: any, agentType: string): Promise<string> {
  const cacheKey = createCacheKey('fast_path_prompt', agentType);
  const cached = configCache.get(cacheKey);
  
  if (cached) {
    return cached.replace(/\{\{agent_type\}\}/g, agentType);
  }

  try {
    const { data: templateData, error } = await supabase
      .rpc('get_prompt_template', { template_name: 'fast_path_response' });

    if (templateData && templateData.length > 0) {
      const template = templateData[0];
      configCache.set(cacheKey, template.template_text);
      return template.template_text.replace(/\{\{agent_type\}\}/g, agentType);
    }
  } catch (error) {
    console.log('Failed to fetch fast path template:', error);
    throw new Error('Fast path response template not available');
  }
}

// Fast path pattern matching with high confidence threshold
function checkFastPath(content: string): { agent: string; confidence: number } | null {
  const patterns = [
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
    }
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

// Optimized response caching with shared cache manager
function checkResponseCache(content: string, deliberationId?: string): string | null {
  const cacheKey = createCacheKey('agent_response', deliberationId || 'global', content.toLowerCase().trim());
  return responseCache.get(cacheKey);
}

function cacheResponse(content: string, response: string, agentType: string, deliberationId?: string): void {
  const cacheKey = createCacheKey('agent_response', deliberationId || 'global', content.toLowerCase().trim());
  responseCache.set(cacheKey, response);
}

// Generate fast response using templates and simple AI with improved error handling and timeout
async function generateFastResponse(
  content: string,
  fastPath: any,
  supabase: any,
  sendData: (data: any) => void
): Promise<string> {
  const openAIApiKey = getOpenAIKey();
  
  // Add timeout for OpenAI requests to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 45000); // 45 second timeout to leave buffer for edge function limit
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          {
            role: 'system',
            content: await getFastPathSystemPrompt(supabase, fastPath.agent)
          },
          { role: 'user', content: content }
        ],
        max_completion_tokens: 1000,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

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
            // Ignore parse errors for streaming
          }
        }
      }
    }

    return fullResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper function to get conversation state
async function getConversationState(supabase: any, deliberationId: string, userId: string): Promise<ConversationContext> {
  try {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('message_type, created_at')
      .eq('deliberation_id', deliberationId)
      .order('created_at', { ascending: false })
      .limit(20);

    const messageCount = recentMessages?.length || 0;
    const recentTypes = recentMessages?.map(m => m.message_type) || [];
    
    return {
      messageCount,
      recentAgentTypes: recentTypes,
      lastAgentType: recentTypes.find(t => t !== 'user') || null
    };
  } catch (error) {
    console.error('Error getting conversation state:', error);
    return { messageCount: 0, recentAgentTypes: [], lastAgentType: null };
  }
}

// Helper function to find similar nodes
async function findSimilarNodes(supabase: any, content: string): Promise<any[]> {
  try {
    // Simple implementation - just return empty array for now
    return [];
  } catch (error) {
    console.error('Error finding similar nodes:', error);
    return [];
  }
}

// Helper function to check available knowledge
async function checkAvailableKnowledge(supabase: any, deliberationId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('agent_knowledge')
      .select('id')
      .limit(1);
    
    return !!(data && data.length > 0);
  } catch (error) {
    console.error('Error checking available knowledge:', error);
    return false;
  }
}

// Retrieve knowledge for bill agent responses using LangChain RAG
async function retrieveBillAgentKnowledge(query: string, deliberationId: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get bill agent for this deliberation
    const { data: billAgents } = await supabase
      .from('agent_configurations')
      .select('id')
      .eq('agent_type', 'bill_agent')
      .eq('deliberation_id', deliberationId)
      .eq('is_active', true)
      .limit(1);

    if (!billAgents || billAgents.length === 0) {
      console.log('📚 No bill agent found for deliberation, checking global agents...');
      
      // Fallback to global bill agent
      const { data: globalAgents } = await supabase
        .from('agent_configurations')
        .select('id')
        .eq('agent_type', 'bill_agent')
        .is('deliberation_id', null)
        .eq('is_active', true)
        .limit(1);
        
      if (!globalAgents || globalAgents.length === 0) {
        console.log('📚 No bill agent found at all');
        return '';
      }
      
      billAgents.push(globalAgents[0]);
    }

    const agentId = billAgents[0].id;
    console.log(`📚 Using LangChain RAG for agent: ${agentId} with query: "${query.substring(0, 100)}..."`);

  // Check if agent has any knowledge first with parallel execution optimization
  const knowledgePromises = [
    supabase
      .from('agent_knowledge')
      .select('id')
      .eq('agent_id', agentId)
      .limit(1),
    // Pre-fetch some knowledge chunks in parallel for faster response  
    supabase
      .from('agent_knowledge')
      .select('content, metadata')
      .eq('agent_id', agentId)
      .limit(3)
  ];

  const [knowledgeCheck, fallbackKnowledge] = await Promise.all(knowledgePromises);

  if (!knowledgeCheck.data || knowledgeCheck.data.length === 0) {
    console.log('📚 No knowledge available for agent, skipping RAG retrieval');
    return '';
  }

    // Use LangChain RAG system for semantic knowledge retrieval
    try {
      console.log('🧠 Calling LangChain RAG system...');
      const { data: ragResult, error: ragError } = await supabase.functions.invoke('langchain-query-knowledge', {
        body: {
          query: query,
          agentId: agentId,
          maxResults: 5 // Get more results than the basic approach for better context
        }
      });

      if (ragError) {
        console.error('❌ LangChain RAG error:', ragError);
        throw new Error(`RAG query failed: ${ragError.message}`);
      }

      if (ragResult?.success && ragResult?.relevantKnowledge?.length > 0) {
        // Extract content from relevant knowledge chunks
        const contextChunks = ragResult.relevantKnowledge
          .map((chunk: any) => chunk.content)
          .join('\n\n');
        
        console.log(`✅ LangChain RAG retrieved ${ragResult.relevantKnowledge.length} semantically relevant chunks`);
        console.log(`📄 Sources: ${ragResult.sources?.join(', ') || 'Unknown'}`);
        
        return contextChunks;
      } else {
        console.log('📚 LangChain RAG returned no relevant results');
        return '';
      }

    } catch (ragError) {
      console.error('❌ LangChain RAG system failed, falling back to pre-fetched knowledge:', ragError);
      
      // Use pre-fetched fallback knowledge for better performance
      if (fallbackKnowledge.data && fallbackKnowledge.data.length > 0) {
        const contextChunks = fallbackKnowledge.data.map((item: any) => item.content).join('\n\n');
        console.log(`📚 Fallback: Using ${fallbackKnowledge.data.length} pre-fetched knowledge chunks`);
        return contextChunks;
      }

      return '';
    }

  } catch (error) {
    console.error('📚 Knowledge retrieval error:', error);
    return '';
  }
}

// Generate streaming response using orchestrator
async function generateStreamingResponse(
  content: string,
  agentType: string,
  analysis: AnalysisResult,
  conversationState: ConversationContext,
  similarNodes: any[],
  deliberationId: string,
  openAIApiKey: string,
  sendData: (data: any) => void,
  orchestrator: AgentOrchestrator,
  mode: string = 'stream'
): Promise<string> {
  console.log(`🎯 generateStreamingResponse called:`, {
    agentType,
    contentLength: content?.length || 0,
    mode,
    hasOrchestrator: !!orchestrator,
    hasOpenAIKey: !!openAIApiKey
  });

  // Get agent configuration through orchestrator
  console.log(`🔧 Getting agent config for ${agentType}...`);
  const agentConfig = await orchestrator.getAgentConfig(agentType, deliberationId);
  console.log(`✅ Agent config retrieved:`, { hasConfig: !!agentConfig, configName: agentConfig?.name });
  
  // Select standardized model (using gpt-5 for best performance)
  const model = 'gpt-5-2025-08-07';
  
  console.log(`🧠 Using ${model} for ${agentType} response (config: ${agentConfig ? 'custom' : 'default'})`);

  // For bill agent, retrieve relevant knowledge first
  let knowledgeContext = '';
  if (agentType === 'bill_agent') {
    console.log('📚 Retrieving knowledge for bill agent...');
    try {
      knowledgeContext = await retrieveBillAgentKnowledge(content, deliberationId);
      console.log(`📚 Knowledge context retrieved: ${knowledgeContext.length} characters`);
    } catch (knowledgeError) {
      console.error('❌ Knowledge retrieval error:', knowledgeError);
      knowledgeContext = '';
    }
  }

  // Generate system prompt using orchestrator
  const enhancementContext = {
    complexity: analysis.complexity,
    similarNodes,
    knowledgeContext
  };
  
  console.log('🔧 Enhancement context:', JSON.stringify(enhancementContext, null, 2));
  
  try {
    const systemPrompt = await orchestrator.generateSystemPrompt(agentConfig, agentType, enhancementContext);
    
    console.log('📝 Generated system prompt length:', systemPrompt?.length || 0);
    console.log('📝 System prompt preview:', systemPrompt?.substring(0, 200) + '...');

    if (!systemPrompt || systemPrompt.trim().length === 0) {
      throw new Error('System prompt is empty or undefined');
    }

    const useStreaming = mode !== 'bulk_processing';
    console.log(`🌊 Streaming mode: ${useStreaming}`);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ];
    
    const requestBody: any = ModelConfigManager.generateAPIParams(model, messages, { maxTokens: 3000, stream: useStreaming });

    console.log('🔧 Request body preview:', JSON.stringify({
      model: requestBody.model,
      messages: [
        { role: 'system', content: `${systemPrompt.substring(0, 100)}...` },
        { role: 'user', content: content }
      ],
      stream: requestBody.stream,
      max_completion_tokens: requestBody.max_completion_tokens
    }, null, 2));

    console.log(`🚀 About to make OpenAI API call (${useStreaming ? 'streaming' : 'non-streaming'})...`);
    console.log('📏 User content length:', content?.length || 0);
    console.log('📝 User content preview:', content?.substring(0, 200) + '...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error: ${response.status} - ${errorText}`);
      
      // If streaming fails due to organization verification, try non-streaming
      if (errorText.includes('organization must be verified') && requestBody.stream) {
        console.log('🔄 Retrying with non-streaming mode...');
        const nonStreamBody = { ...requestBody, stream: false };
        
        const nonStreamResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nonStreamBody),
        });
        
        if (nonStreamResponse.ok) {
          const data = await nonStreamResponse.json();
          const content = data.choices?.[0]?.message?.content || '';
          console.log(`✅ Non-streaming response received: ${content.length} characters`);
          
          // Send the content as if it were streamed
          sendData({ content, done: false });
          return content;
        }
      }
      
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    console.log(`✅ OpenAI API call successful for ${agentType}`);
    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

    // Handle non-streaming response for bulk processing
    if (!useStreaming) {
      console.log('📦 Processing non-streaming response for bulk mode');
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log(`✅ Non-streaming response received: ${content.length} characters`);
      
      // Send the content as if it were streamed
      sendData({ content, done: false });
      return content;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    console.log('🔍 Reader available:', !!reader);

    if (reader) {
      console.log('📖 Starting to read stream chunks...');
      let chunkCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        chunkCount++;
        console.log(`📦 Chunk ${chunkCount}: done=${done}, value size=${value?.length || 0}`);
        
        if (done) {
          console.log(`🏁 Stream completed after ${chunkCount} chunks`);
          break;
        }

        const chunk = decoder.decode(value);
        console.log(`📝 Raw chunk ${chunkCount}:`, chunk.substring(0, 200) + '...');
        
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        console.log(`📋 Found ${lines.length} data lines in chunk ${chunkCount}`);
        
        for (const line of lines) {
          if (line.includes('[DONE]')) {
            console.log('🔚 Found [DONE] marker');
            continue;
          }
          
          try {
            const data = JSON.parse(line.slice(6));
            console.log(`📦 Parsed data from chunk ${chunkCount}:`, JSON.stringify(data, null, 2));
            const content = data.choices?.[0]?.delta?.content || '';
            if (content) {
              console.log(`💬 Content found: "${content}"`);
              fullResponse += content;
              sendData({ content, done: false });
            } else {
              console.log('📭 No content in this chunk');
            }
          } catch (e) {
            console.warn(`⚠️ Parse error in chunk ${chunkCount}:`, e);
            console.warn(`⚠️ Problematic line: "${line}"`);
          }
        }
      }
    }

    console.log(`📝 Full response length: ${fullResponse.length}`);
    return fullResponse;
    
  } catch (systemPromptError) {
    console.error('❌ Error generating system prompt - FULL ERROR DETAILS:', {
      error: systemPromptError,
      message: systemPromptError.message,
      stack: systemPromptError.stack,
      name: systemPromptError.name
    });
    
    sendData({ 
      content: `Error generating system prompt: ${systemPromptError.message}`,
      done: false 
    });
    throw systemPromptError;
  }
}

// Distributed lock for preventing duplicate agent responses (F001 Fix)
const PROCESSING_LOCKS = new Map<string, { timestamp: number; lockId: string }>();
const LOCK_TIMEOUT = 30000; // 30 seconds

function acquireProcessingLock(messageId: string): string | null {
  const now = Date.now();
  const existing = PROCESSING_LOCKS.get(messageId);
  
  // Clean up expired locks
  if (existing && (now - existing.timestamp) > LOCK_TIMEOUT) {
    PROCESSING_LOCKS.delete(messageId);
  }
  
  // Check if still locked
  if (PROCESSING_LOCKS.has(messageId)) {
    console.log(`⚠️ Message ${messageId} is already being processed`);
    return null;
  }
  
  const lockId = crypto.randomUUID();
  PROCESSING_LOCKS.set(messageId, { timestamp: now, lockId });
  console.log(`🔒 Acquired processing lock for message ${messageId}, lockId: ${lockId}`);
  return lockId;
}

function releaseProcessingLock(messageId: string, lockId: string): void {
  const existing = PROCESSING_LOCKS.get(messageId);
  if (existing && existing.lockId === lockId) {
    PROCESSING_LOCKS.delete(messageId);
    console.log(`🔓 Released processing lock for message ${messageId}`);
  }
}

// Main streaming handler with distributed locking for race condition prevention
serve(async (req) => {
  console.log('🚀 Edge function invoked:', req.method, req.url);
  console.log('📋 Request headers:', Object.fromEntries(req.headers.entries()));
  
  // CRITICAL: Handle CORS preflight first
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request');
    return new Response(null, { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400'
      } 
    });
  }

  try {
    console.log('🔧 Starting environment validation');
    // Revert to original working environment validation
    const { supabase, userSupabase } = validateAndGetEnvironment();
    console.log('✅ Environment validation successful');
    
    // Get authorization header for user authentication  
    const authHeader = req.headers.get('authorization');
    console.log('🔑 Auth header present:', !!authHeader);
    
    // Since verify_jwt is disabled, we handle auth manually for security
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ Missing or invalid authorization header');
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📥 Parsing request body');
    // Use proper JSON parsing with error handling
    const { messageId, deliberationId, mode = 'stream' } = await parseAndValidateRequest<{
      messageId: string;
      deliberationId: string;
      mode?: string;
    }>(req, ['messageId', 'deliberationId']);
    
    console.log('🚀 Starting streaming agent orchestration', { messageId, deliberationId, mode });
    
    // F001 Fix: Acquire distributed lock to prevent duplicate processing
    console.log('🔒 Attempting to acquire processing lock');
    const lockId = acquireProcessingLock(messageId);
    if (!lockId) {
      console.log('⚠️ Message already being processed:', messageId);
      return new Response(JSON.stringify({ 
        error: 'Message is already being processed',
        messageId 
      }), {
        status: 409, // Conflict
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('✅ Processing lock acquired:', lockId);
    
    // Special handling for bulk processing mode
    if (mode === 'bulk_processing') {
      console.log(`🔄 Bulk processing mode enabled for message ${messageId}`);
    }

    console.log('🌊 Creating streaming response transform');
    // Create streaming response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send data function
    const sendData = (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      console.log('📤 Sending data chunk:', data.content?.substring(0, 50) || '[no content]');
      writer.write(encoder.encode(message));
    };

    console.log('🚀 Starting background processing');
    // Start background processing with auth header and cleanup
    processStreamingOrchestration(messageId, deliberationId, mode, authHeader, sendData).finally(() => {
      console.log('🔓 Releasing processing lock');
      releaseProcessingLock(messageId, lockId);
      console.log('🔚 Closing writer');
      writer.close();
    });

    console.log('✅ Returning streaming response');
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
    console.error('❌ Error stack:', (error as Error)?.stack);
    // Ensure proper error response with status details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return createErrorResponse(error, 500, 'agent-orchestration-stream');
  }
});

async function processStreamingOrchestration(
  messageId: string,
  deliberationId: string,
  mode: string,
  authHeader: string,
  sendData: (data: any) => void
) {
  console.log(`🚀 Starting processStreamingOrchestration`, { messageId, deliberationId, mode });
  console.log(`🔐 Auth header present:`, !!authHeader);
  
  try {
    console.log('🔧 Getting environment clients');
    // Use shared environment validation with caching
    const { supabase: serviceSupabase, userSupabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();
    console.log('✅ Environment clients ready');

    // Configure user client with auth header
    console.log('🔐 Configuring authenticated user client');
    const authenticatedUserSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { authorization: authHeader }
        },
        auth: { persistSession: false }
      }
    );

    console.log(`📊 Supabase clients created successfully`);
  
    // Check for existing responses first with improved performance
    console.log(`🔍 Checking for existing responses for message ${messageId}...`);
    
    const { data: existingResponses, error: checkError } = await serviceSupabase
      .from('messages')
      .select('id, agent_context')
      .eq('deliberation_id', deliberationId)
      .eq('parent_message_id', messageId)
      .neq('message_type', 'user');
    
    if (checkError) {
      console.error(`❌ Error checking existing responses: ${checkError.message}`);
      sendData({ content: '', done: true, error: 'check_error' });
      return;
    }
    
    if (existingResponses && existingResponses.length > 0) {
      console.log(`✅ Response(s) already exist for message ${messageId} - skipping processing`);
      console.log(`   Existing responses: ${existingResponses.map(r => r.id).join(', ')}`);
      sendData({ 
        content: '', 
        done: true,
        duplicate: true,
        existingResponseIds: existingResponses.map(r => r.id)
      });
      return;
    }
      
    console.log(`✅ No existing responses found for message ${messageId} - proceeding with processing`);

    // Initialize orchestrator with service client
    console.log(`🤖 Initializing AgentOrchestrator`);
    const orchestrator = new AgentOrchestrator(serviceSupabase);
    console.log(`✅ AgentOrchestrator initialized successfully`);

    // Get message details using user client (respects RLS)
    console.log(`📨 Fetching message details for messageId: ${messageId}`);
    console.log(`🔍 Using auth header: ${authHeader ? 'YES' : 'NO'}`);
    
    let message: any = null;
    const { data: messageData, error: messageError } = await authenticatedUserSupabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !messageData) {
      console.error(`❌ Error fetching message:`, messageError);
      console.error(`❌ Full message error details:`, JSON.stringify(messageError, null, 2));
      console.error(`❌ Message ID being searched: ${messageId}`);
      console.error(`❌ Deliberation ID: ${deliberationId}`);
      
      // Try with service role as fallback
      console.log(`🔄 Trying with service role client...`);
      const { data: serviceMessage, error: serviceError } = await serviceSupabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
        
      if (serviceError || !serviceMessage) {
        console.error(`❌ Service role also failed:`, serviceError);
        sendData({ error: `Message not found: ${messageId}`, done: true });
        return;
      } else {
        console.log(`✅ Found message with service role - RLS issue detected`);
        console.log(`📊 Message details:`, { 
          id: serviceMessage.id, 
          type: serviceMessage.message_type,
          userId: serviceMessage.user_id,
          content: serviceMessage.content?.substring(0, 50) 
        });
        // Use the service message but continue processing
        message = serviceMessage;
      }
    } else {
      message = messageData;
    }

    console.log(`✅ Message fetched successfully:`, {
      id: message.id,
      content: message.content?.substring(0, 100) + '...',
      type: message.message_type,
      userId: message.user_id,
      deliberationId: message.deliberation_id
    });

    console.log('📨 Processing message:', message.content);

    // Calculate response timestamp: parent message time + 1 second
    const parentTimestamp = new Date(message.created_at);
    const responseTimestamp = new Date(parentTimestamp.getTime() + 1000).toISOString();

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
        serviceSupabase,
        sendData
      );

      // Cache the response
      cacheResponse(message.content, response, fastPath.agent, deliberationId);

      // Store response using service client with enhanced verification for bulk processing
      const insertData = {
        content: response,
        message_type: fastPath.agent,
        user_id: message.user_id,
        deliberation_id: deliberationId,
        parent_message_id: messageId, // Link to the triggering message
        created_at: responseTimestamp, // Use calculated timestamp for proper ordering
        agent_context: { 
          agent_type: fastPath.agent,
          processing_method: 'high_confidence_fast_path',
          confidence: fastPath.confidence,
          processing_mode: mode
        }
      };

      const { data: fastInsertData, error: fastInsertError } = await serviceSupabase.from('messages').insert(insertData);

      if (fastInsertError) {
        console.error('❌ Fast path database insert error:', fastInsertError);
        throw new Error(`Failed to save fast path response: ${fastInsertError.message}`);
      }

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
        sendData,
        orchestrator,
        mode
      );

      // Store response using service client
      await serviceSupabase.from('messages').insert({
        content: response,
        message_type: 'bill_agent',
        user_id: message.user_id,
        deliberation_id: deliberationId,
        parent_message_id: messageId,
        created_at: responseTimestamp,
        agent_context: { 
          agent_type: 'bill_agent',
          processing_method: 'mode_forced',
          mode: 'learn'
        }
      });

      sendData({ done: true });
      return;
    }

    // Enhanced orchestration using unified service
    console.log('🔄 Using enhanced orchestration');
    
    // For bulk processing, skip complex analysis to avoid timeouts
    let analysis, conversationState, similarNodes, availableKnowledge;
    
    if (mode === 'bulk_processing') {
      console.log('📦 Bulk mode: Using simplified analysis');
      analysis = { intent: 'general', complexity: 0.5, requiresExpertise: false };
      conversationState = { messageCount: 1, recentAgentTypes: [], lastAgentType: null };
      similarNodes = [];
      availableKnowledge = false;
    } else {
      console.log('🧠 Performing enhanced analysis');
      
      // Parallel execution for better performance
      const [analysisResult, conversationResult, similarNodesResult, knowledgeResult] = await Promise.all([
        orchestrator.analyzeMessage(message.content, deliberationId).catch(e => {
          console.warn('Analysis failed:', e.message);
          return { intent: 'general', complexity: 0.5, requiresExpertise: false };
        }),
        getConversationState(serviceSupabase, deliberationId, message.user_id).catch(e => {
          console.warn('Conversation state failed:', e.message);
          return { messageCount: 1, recentAgentTypes: [], lastAgentType: null };
        }),
        findSimilarNodes(serviceSupabase, message.content).catch(e => {
          console.warn('Similar nodes failed:', e.message);
          return [];
        }),
        checkAvailableKnowledge(serviceSupabase, deliberationId).catch(e => {
          console.warn('Knowledge check failed:', e.message);
          return false;
        })
      ]);
      
      analysis = analysisResult;
      conversationState = conversationResult;
      similarNodes = similarNodesResult;
      availableKnowledge = knowledgeResult;
    }

    // Enhanced agent selection with performance optimizations
    try {
      const selectedAgent = await orchestrator.selectOptimalAgent(
        analysis,
        conversationState,
        deliberationId,
        availableKnowledge
      );

      console.log(`🤖 Selected agent: ${selectedAgent}`);
      sendData({ agentType: selectedAgent, content: '', done: false });

      // Generate streaming response with orchestrator
      const response = await generateStreamingResponse(
        message.content,
        selectedAgent,
        analysis,
        conversationState,
        similarNodes,
        deliberationId,
        openAIApiKey,
        sendData,
        orchestrator,
        mode
      );

      console.log(`✅ Generated response length: ${response.length}`);
      console.log(`✅ Response preview: ${response.substring(0, 200)}...`);

      // Cache the final response
      cacheResponse(message.content, response, selectedAgent, deliberationId);

      // Store final response using service client
      console.log('💾 Storing response in database...');
      
      const insertData = {
        content: response,
        message_type: selectedAgent,
        user_id: message.user_id,
        deliberation_id: deliberationId,
        parent_message_id: messageId,
        created_at: responseTimestamp,
        agent_context: { 
          agent_type: selectedAgent,
          processing_method: 'full_orchestration',
          analysis: analysis,
          processing_mode: mode
        }
      };

      const { data: insertResult, error: insertError } = await serviceSupabase
        .from('messages')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError) {
        console.error('❌ Database insert error:', insertError);
        sendData({ error: 'Failed to save response to database', insertError: insertError.message });
        throw new Error(`Failed to save response: ${insertError.message}`);
      } else {
        console.log('✅ Response stored successfully in database');
      }

      sendData({ done: true });
      console.log('🏁 Sent final completion signal');

    } catch (responseError) {
      console.error('❌ Error generating response - FULL ERROR DETAILS:', {
        error: responseError,
        message: responseError.message,
        stack: responseError.stack,
        name: responseError.name
      });
      
      sendData({ 
        error: `Response generation failed: ${responseError.message}`,
        content: `Error: ${responseError.message}. Please check the logs for details.`,
        done: true 
      });
      return; // Exit early on error
    }

  } catch (error) {
    console.error('❌ Streaming processing error:', error);
    sendData({ error: error.message, done: true });
  }
}