import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iowsxuxkgvpgrvvklwyt.supabase.co',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Simple memory implementation for Edge Functions
class EdgeMemoryService {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async getConversationHistory(userId: string, deliberationId?: string, limit = 10): Promise<Array<{ role: string; content: string }>> {
    try {
      let query = this.supabase
        .from('messages')
        .select('content, message_type, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Get more to account for agent responses

      if (deliberationId) {
        query = query.eq('deliberation_id', deliberationId);
      }

      const { data: messages, error } = await query;

      if (error) {
        console.error('Error fetching conversation history:', error);
        return [];
      }

      if (!messages || messages.length === 0) {
        return [];
      }

      // Convert to conversation format and reverse to chronological order
      const conversation = messages.reverse().map(msg => ({
        role: msg.message_type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Return only the most recent pairs to stay within token limits
      return conversation.slice(-limit);
    } catch (error) {
      console.error('Failed to get conversation history:', error);
      return [];
    }
  }

  formatHistoryForPrompt(history: Array<{ role: string; content: string }>): string {
    if (history.length === 0) {
      return '';
    }

    const formatted = history.map(msg => 
      `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    return `\n\nPrevious conversation:\n${formatted}\n\nPlease respond to the current message while being aware of this conversation context.\n\n`;
  }
}

serve(async (req) => {
  console.log('🚀 Agent response with memory function called!');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate request method
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Get and validate authorization header
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json();
    console.log('📊 Request body:', body);
    
    const { messageId, deliberationId, mode = 'chat' } = body;
    console.log('🔍 Processing agent response with memory for message:', messageId, 'in deliberation:', deliberationId, 'mode:', mode);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasOpenAIKey: !!openaiApiKey
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!openaiApiKey) {
      console.error('OpenAI API key not configured')
      throw new Error('Service configuration error')
    }

    // Validate API key format
    if (!openaiApiKey.startsWith('sk-')) {
      console.error('Invalid OpenAI API key format')
      throw new Error('Service configuration error')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // Initialize memory service
    const memoryService = new EdgeMemoryService(supabase);

    // Get the user message
    console.log('📨 Fetching message...');
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError) {
      console.error('❌ Message error:', messageError);
      throw new Error(`Failed to get message: ${messageError.message}`);
    }

    console.log('✅ Message found:', message.content);

    // Get conversation history for memory context
    console.log('🧠 Fetching conversation history...');
    const conversationHistory = await memoryService.getConversationHistory(
      message.user_id, 
      deliberationId, 
      6 // Get last 6 messages for context
    );
    console.log(`📚 Found ${conversationHistory.length} previous messages for context`);

    // Get deliberation context if deliberationId is provided
    let deliberationContext = '';
    if (deliberationId) {
      console.log('📋 Fetching deliberation context...');
      const { data: deliberation, error: deliberationError } = await supabase
        .from('deliberations')
        .select('title, description, notion')
        .eq('id', deliberationId)
        .single();

      if (deliberation && !deliberationError) {
        const context = [];
        context.push(`DELIBERATION TITLE: ${deliberation.title}`);
        
        if (deliberation.notion) {
          context.push(`DELIBERATION NOTION: ${deliberation.notion}`);
        }
        
        if (deliberation.description) {
          context.push(`DELIBERATION DESCRIPTION: ${deliberation.description}`);
        }

        deliberationContext = context.length > 1 ? `\n\nDELIBERATION CONTEXT:\n${context.join('\n')}\n\n` : '';
        console.log('✅ Deliberation context loaded');
      }
    }

    // Get active agents - filter by mode
    console.log(`🤖 Fetching active agents for ${mode} mode...`);
    let agentQuery = supabase
      .from('agent_configurations')
      .select('*')
      .eq('is_active', true);

    // In learn mode, only get the bill agent
    if (mode === 'learn') {
      agentQuery = agentQuery.eq('agent_type', 'bill_agent');
    }

    const { data: agents, error: agentsError } = await agentQuery;

    if (agentsError) {
      console.error('❌ Agents error:', agentsError);
      throw new Error(`Failed to get agents: ${agentsError.message}`);
    }

    console.log(`🎯 Found ${agents?.length || 0} active agents for ${mode} mode`);

    if (!agents || agents.length === 0) {
      console.log('⚠️ No active agents found');
      return new Response(JSON.stringify({ success: true, message: 'No active agents' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate response from the first agent with memory context
    const agent = agents[0];
    console.log(`🧠 Generating response from ${agent.name} with conversation memory...`);

    // Format conversation history for the prompt
    const historyContext = memoryService.formatHistoryForPrompt(conversationHistory);

    // Construct the enhanced prompt with memory
    const enhancedPrompt = `${historyContext}Current message: "${message.content}"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { 
            role: 'system', 
            content: `${agent.system_prompt || `You are ${agent.name}, a deliberation agent.`}${deliberationContext}

You have access to the conversation history above. Please respond naturally while maintaining context from previous exchanges. Be conversational and reference previous points when relevant.`
          },
          { 
            role: 'user', 
            content: enhancedPrompt
          }
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    console.log('🔄 OpenAI response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiData = await response.json();
    console.log('✅ OpenAI response received');
    
    if (!aiData.choices?.[0]?.message?.content) {
      console.error('❌ No content in OpenAI response');
      throw new Error('No response content from OpenAI');
    }

    const agentResponse = aiData.choices[0].message.content;
    console.log('💬 Agent response:', agentResponse.substring(0, 100) + '...');

    // Store agent response in database
    console.log('💾 Storing agent response...');
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        content: agentResponse,
        message_type: agent.agent_type,
        deliberation_id: deliberationId,
        user_id: message.user_id,
        agent_context: {
          agent_id: agent.id,
          agent_name: agent.name,
          triggered_by_message: messageId,
          used_memory_context: conversationHistory.length > 0
        }
      });

    if (insertError) {
      console.error('❌ Insert error:', insertError);
      throw new Error(`Failed to insert response: ${insertError.message}`);
    }

    console.log('🎉 Agent response with memory stored successfully!');

    return new Response(JSON.stringify({ 
      success: true, 
      agentName: agent.name,
      responseLength: agentResponse.length,
      memoryContextUsed: conversationHistory.length > 0,
      conversationLength: conversationHistory.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in agent-response-with-memory function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});