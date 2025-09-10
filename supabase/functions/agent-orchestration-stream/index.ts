import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Basic CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to handle CORS preflight
function handleCORSPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

// Helper function to create error response
function createErrorResponse(error: any, status: number = 500, context?: string): Response {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[${context || 'ERROR'}]:`, errorMessage);
  
  return new Response(
    JSON.stringify({ 
      error: errorMessage,
      context: context || 'unknown'
    }), 
    { 
      status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

// Helper function to get OpenAI API key
function getOpenAIKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) {
    throw new Error('OpenAI API key not configured');
  }
  return key;
}

// Helper function to validate request
async function parseAndValidateRequest(req: Request, requiredFields: string[]) {
  const body = await req.json();
  
  for (const field of requiredFields) {
    if (!body[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  return body;
}

// Helper function to create streaming response
function createStreamingResponse(): { response: Response; writer: WritableStreamDefaultWriter } {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const writer = {
        write: (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`));
          } catch (error) {
            console.error('Error writing to stream:', error);
          }
        },
        close: () => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '', done: true })}\n\n`));
            controller.close();
          } catch (error) {
            console.error('Error closing stream:', error);
          }
        }
      };
      
      // Store writer for external access
      (controller as any)._writer = writer;
    }
  });

  const response = new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });

  return { 
    response, 
    writer: (stream as any)._writer || {
      write: () => {},
      close: () => {}
    }
  };
}

// Main orchestration function
async function processStreamingOrchestration(
  messageId: string,
  deliberationId: string,
  mode: string,
  serviceSupabase: any,
  authSupabase: any,
  sendData: (data: any) => void
): Promise<void> {
  console.log(`🤖 Processing orchestration for message ${messageId} in mode ${mode}`);

  try {
    // Get the message using authenticated client
    const { data: message, error: messageError } = await authSupabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      throw new Error(`Message not found: ${messageError?.message || 'Unknown error'}`);
    }

    console.log(`📝 Retrieved message: "${message.content.substring(0, 100)}..."`);

    // Get active agents for this deliberation
    const { data: agents, error: agentsError } = await serviceSupabase
      .from('agent_configurations')
      .select('*')
      .eq('deliberation_id', deliberationId)
      .eq('is_active', true);

    if (agentsError) {
      throw new Error(`Failed to get agents: ${agentsError.message}`);
    }

    console.log(`🤖 Found ${agents?.length || 0} active agents`);

    // Simple agent selection - pick the first active agent
    const selectedAgent = agents?.[0];
    if (!selectedAgent) {
      throw new Error('No active agents found for this deliberation');
    }

    console.log(`🎯 Selected agent: ${selectedAgent.name} (${selectedAgent.agent_type})`);

    // Generate response using OpenAI
    const openAIApiKey = getOpenAIKey();
    const systemPrompt = selectedAgent.prompt_overrides?.system_prompt || `You are ${selectedAgent.name}, a ${selectedAgent.agent_type}. ${selectedAgent.description || ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message.content }
        ],
        max_tokens: 1000,
        stream: true
      }),
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

    // Save the agent response to the database using authenticated client
    const { error: insertError } = await authSupabase
      .from('messages')
      .insert({
        deliberation_id: deliberationId,
        user_id: message.user_id, // Use the same user for now
        content: fullResponse,
        message_type: selectedAgent.agent_type,
        agent_context: {
          agent_type: selectedAgent.agent_type,
          processing_mode: mode,
          processing_method: 'simplified_orchestration'
        },
        parent_message_id: messageId
      });

    if (insertError) {
      console.error('Failed to save agent response:', insertError);
    }

    sendData({ content: '', done: true });
    console.log(`✅ Orchestration completed successfully`);

  } catch (error) {
    console.error('❌ Orchestration error:', error);
    sendData({ error: error instanceof Error ? error.message : 'Unknown error', done: true });
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('🚀 Agent orchestration stream starting...');

    // Parse and validate request
    const { messageId, deliberationId, mode } = await parseAndValidateRequest(req, [
      'messageId', 
      'deliberationId'
    ]);

    console.log(`📋 Request: messageId=${messageId}, deliberationId=${deliberationId}, mode=${mode || 'chat'}`);

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Create service role client (for agent configurations)
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Extract user token for authenticated operations
    const authHeader = req.headers.get('authorization');
    let authSupabase = serviceSupabase; // fallback to service role
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const userToken = authHeader.substring(7);
      try {
        // Create authenticated client with user's token
        authSupabase = createClient(supabaseUrl, supabaseServiceKey, {
          global: {
            headers: {
              authorization: `Bearer ${userToken}`
            }
          }
        });
        console.log('🔐 Using authenticated user client');
      } catch (error) {
        console.warn('⚠️ Failed to create authenticated client, using service role:', error);
      }
    }

    // Create streaming response
    const { response, writer } = createStreamingResponse();

    // Process orchestration in background
    processStreamingOrchestration(
      messageId,
      deliberationId,
      mode || 'chat',
      serviceSupabase,
      authSupabase,
      (data) => writer.write(JSON.stringify(data))
    ).then(() => {
      writer.close();
    }).catch((error) => {
      console.error('Orchestration failed:', error);
      writer.write(JSON.stringify({ error: error.message, done: true }));
      writer.close();
    });

    return response;

  } catch (error: any) {
    console.error('❌ Request processing error:', error);
    return createErrorResponse(error, 500, 'agent-orchestration-stream');
  }
});