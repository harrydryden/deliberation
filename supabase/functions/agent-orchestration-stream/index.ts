import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';
import { AgentOrchestrator, type AnalysisResult, type ConversationContext } from '../shared/agent-orchestrator.ts';

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
    // Get authorization header for user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messageId, deliberationId, mode = 'stream' } = await req.json();
    
    console.log('🚀 Starting streaming agent orchestration', { messageId, deliberationId, mode });
    
    // Special handling for bulk processing mode
    if (mode === 'bulk_processing') {
      console.log(`🔄 Bulk processing mode enabled for message ${messageId}`);
    }

    // Create streaming response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send data function
    const sendData = (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message));
    };

    // Start background processing with auth header
    processStreamingOrchestration(messageId, deliberationId, mode, authHeader, sendData).finally(() => {
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
  authHeader: string,
  sendData: (data: any) => void
) {
  try {
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
    
    // Service client for database operations
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // CRITICAL: Check for existing responses BEFORE proceeding
    console.log(`🔍 Checking for existing responses for message ${messageId}...`);
    const { data: existingResponses, error: checkError } = await serviceSupabase
      .from('messages')
      .select('id, agent_context')
      .eq('deliberation_id', deliberationId)
      .eq('parent_message_id', messageId)
      .neq('message_type', 'user');
    
    if (checkError) {
      console.error(`❌ Error checking existing responses: ${checkError.message}`);
      sendData({ content: '', done: true, duplicate: true, reason: 'check_error' });
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
    } else {
      console.log(`✅ No existing responses found for message ${messageId} - proceeding with processing`);
    }
    
    // User client for reading messages (respects RLS)
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          authorization: authHeader,
        },
      },
    });

    // Initialize orchestrator with service client
    const orchestrator = new AgentOrchestrator(serviceSupabase);

    // Get message details using user client (respects RLS)
    const { data: message, error: messageError } = await userSupabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      throw new Error(`Message not found or access denied: ${messageError?.message}`);
    }

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
        openAIApiKey,
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

      // Enhanced verification for bulk processing
      if (mode === 'bulk_processing') {
        console.log('✅ Fast path response stored, verifying for bulk processing...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const { data: verifyData } = await serviceSupabase
          .from('messages')
          .select('id')
          .eq('parent_message_id', messageId)
          .eq('deliberation_id', deliberationId)
          .neq('message_type', 'user')
          .single();
          
        if (!verifyData) {
          throw new Error('Fast path response verification failed');
        }
        
        console.log(`✅ Fast path response verified: ${verifyData.id}`);
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
        parent_message_id: messageId, // Link to the triggering message
        created_at: responseTimestamp, // Use calculated timestamp for proper ordering
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
      // Use default analysis for bulk processing
      analysis = {
        intent: 'general',
        complexity: 0.5,
        topicRelevance: 0.5,
        requiresExpertise: false
      };
      // Get simplified context
      conversationState = await getConversationState(userSupabase, deliberationId, message.user_id);
      similarNodes = [];
      availableKnowledge = await checkAvailableKnowledge(serviceSupabase, deliberationId);
    } else {
      // Full analysis for normal processing
      console.log('🔄 Full analysis mode');
      const analysisPromise = orchestrator.analyzeMessage(message.content, openAIApiKey);
      const conversationPromise = getConversationState(userSupabase, deliberationId, message.user_id);
      const similarNodesPromise = findSimilarNodes(userSupabase, message.content);
      const knowledgePromise = checkAvailableKnowledge(serviceSupabase, deliberationId);

      // Wait for all parallel operations
      [analysis, conversationState, similarNodes, availableKnowledge] = await Promise.all([
        analysisPromise,
        conversationPromise,
        similarNodesPromise,
        knowledgePromise
      ]);
    }

    console.log('📊 Analysis complete, selecting optimal agent...');

    // Enhanced agent selection using orchestrator
    const selectedAgent = await orchestrator.selectOptimalAgent(
      analysis, 
      conversationState, 
      deliberationId, 
      availableKnowledge
    );
    
    sendData({ 
      agentType: selectedAgent,
      content: '',
      done: false
    });

    // Generate streaming response using orchestrator
    try {
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
        parent_message_id: messageId, // Link to the triggering message
        created_at: responseTimestamp, // Use calculated timestamp for proper ordering
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
        
        // Enhanced verification for bulk processing
        if (mode === 'bulk_processing') {
          console.log('🔍 Running enhanced verification for bulk processing...');
          
          // Wait for database write to complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const { data: verifyData } = await serviceSupabase
            .from('messages')
            .select('id, content')
            .eq('id', insertResult.id)
            .single();
          
          if (!verifyData || !verifyData.content) {
            console.error('❌ Bulk processing verification failed - no content found');
            throw new Error('Bulk processing verification failed');
          } else {
            console.log(`✅ Bulk processing response verified: ${verifyData.id}`);
          }
        } else {
          // Standard verification for regular processing
          const { data: verifyData } = await serviceSupabase
            .from('messages')
            .select('id, content')
            .eq('id', insertResult.id)
            .single();
          
          if (!verifyData || !verifyData.content) {
            console.error('❌ Response verification failed - no content found');
            throw new Error('Response verification failed');
          } else {
            console.log('✅ Response verified in database');
          }
        }
      }

    } catch (responseError) {
      console.error('❌ Error generating response:', responseError);
      sendData({ 
        content: 'I apologise, but I encountered an issue generating a response. Please try again.',
        done: false 
      });
    }

    sendData({ done: true });
    console.log('🏁 Sent final completion signal');

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
      model: 'gpt-5-2025-08-07',
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
      max_completion_tokens: 500,
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

// Enhanced knowledge availability check
async function checkAvailableKnowledge(supabase: any, deliberationId?: string): Promise<Record<string, boolean>> {
  const knowledge = {
    bill_agent: false,
    peer_agent: false,
    flow_agent: false
  };

  try {
    // Check if bill agent has knowledge base
    const { data: billAgents } = await supabase
      .from('agent_configurations')
      .select('id')
      .eq('agent_type', 'bill_agent')
      .or(`deliberation_id.eq.${deliberationId},deliberation_id.is.null`)
      .eq('is_active', true)
      .limit(1);

    if (billAgents && billAgents.length > 0) {
      const { data: knowledge_count } = await supabase
        .from('agent_knowledge')
        .select('id', { count: 'exact' })
        .eq('agent_id', billAgents[0].id)
        .limit(1);

      knowledge.bill_agent = knowledge_count && knowledge_count.length > 0;
    }
  } catch (error) {
    console.warn('Knowledge availability check failed:', error);
  }

  return knowledge;
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

// Legacy function - replaced by orchestrator method

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
  // Get agent configuration through orchestrator
  const agentConfig = await orchestrator.getAgentConfig(agentType, deliberationId);
  
  // Select standardized model (using gpt-5 for best performance)
  const model = 'gpt-5-2025-08-07';
  
  console.log(`🧠 Using ${model} for ${agentType} response (config: ${agentConfig ? 'custom' : 'default'})`);

  // For bill agent, retrieve relevant knowledge first
  let knowledgeContext = '';
  if (agentType === 'bill_agent') {
    console.log('📚 Retrieving knowledge for bill agent...');
    knowledgeContext = await retrieveBillAgentKnowledge(content, deliberationId);
  }

  // Generate system prompt using orchestrator
  const enhancementContext = {
    complexity: analysis.complexity,
    similarNodes,
    knowledgeContext
  };
  
  console.log('🔧 Enhancement context:', JSON.stringify(enhancementContext, null, 2));
  
  const systemPrompt = orchestrator.generateSystemPrompt(agentConfig, agentType, enhancementContext);
  
  console.log('📝 Generated system prompt length:', systemPrompt?.length || 0);
  console.log('📝 System prompt preview:', systemPrompt?.substring(0, 200) + '...');

  if (!systemPrompt || systemPrompt.trim().length === 0) {
    throw new Error('System prompt is empty or undefined');
  }

  const useStreaming = mode !== 'bulk_processing';
  
  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ],
    stream: useStreaming,
    max_completion_tokens: 3000
  };

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
}

// Legacy function - replaced by orchestrator

// Retrieve knowledge for bill agent responses
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
    console.log(`📚 Querying knowledge for agent: ${agentId}`);

    // Try LangChain query first (more advanced) with retry logic
    let langchainSuccess = false;
    const maxRetries = 2;
    
    for (let attempt = 1; attempt <= maxRetries && !langchainSuccess; attempt++) {
      try {
        console.log(`📚 LangChain attempt ${attempt}/${maxRetries}`);
        
        const langchainPromise = supabase.functions.invoke('langchain-query-knowledge', {
          body: { 
            query, 
            agentId, 
            maxResults: 5 
          }
        });
        
        // Add timeout to LangChain call
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('LangChain timeout')), 45000);
        });
        
        const { data, error } = await Promise.race([langchainPromise, timeoutPromise]);

        if (!error && data?.response) {
          console.log('✅ LangChain knowledge retrieved successfully');
          langchainSuccess = true;
          return data.response;
        } else {
          console.log(`❌ LangChain attempt ${attempt} failed:`, error?.message || 'No response');
          if (attempt === maxRetries) {
            console.log('📚 All LangChain attempts failed, falling back to direct query');
          }
        }
      } catch (langchainError) {
        console.warn(`❌ LangChain attempt ${attempt} error:`, langchainError.message);
        if (langchainError.message.includes('timeout')) {
          console.log('🕒 LangChain timeout detected');
        }
        if (attempt === maxRetries) {
          console.warn('📚 All LangChain attempts failed, using fallback');
        }
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Fallback: Use direct Supabase query for knowledge retrieval
    console.log('📚 LangChain query failed, using direct knowledge query as fallback');
    
    try {
      const { data: knowledgeData } = await supabase
        .rpc('match_agent_knowledge', {
          query_embedding: null, // Will need embedding but for now just get random knowledge
          match_count: 5,
          agent_filter: agentId
        });

      if (knowledgeData && knowledgeData.length > 0) {
        const contextChunks = knowledgeData.map((item: any) => item.content).join('\n\n');
        console.log(`📚 Retrieved ${knowledgeData.length} knowledge chunks via fallback`);
        return contextChunks;
      }
      
      // If no specific knowledge, get general agent knowledge
      const { data: generalKnowledge } = await supabase
        .from('agent_knowledge')
        .select('content, metadata')
        .eq('agent_id', agentId)
        .limit(3);
        
      if (generalKnowledge && generalKnowledge.length > 0) {
        const contextChunks = generalKnowledge.map((item: any) => item.content).join('\n\n');
        console.log(`📚 Retrieved ${generalKnowledge.length} general knowledge chunks`);
        return contextChunks;
      }
    } catch (fallbackError) {
      console.error('📚 Fallback knowledge query error:', fallbackError);
    }

    return '';
  } catch (error) {
    console.error('📚 Knowledge retrieval error:', error);
    return '';
  }
}

// Legacy function - no longer used for system prompts
async function getPromptFromDatabase(agentType: string, promptType: string): Promise<string | null> {
  // System prompts are now handled by agent configurations
  if (promptType === 'system_prompt') {
    console.warn('getPromptFromDatabase called for system_prompt - this should now use agent configurations');
    return null;
  }

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