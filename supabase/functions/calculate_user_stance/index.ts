import { serve } from "std/http/server.ts";
import { createClient } from '@supabase/supabase-js';

// Inlined utilities to avoid cross-folder import issues
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
  console.error(`[${errorId}] ${context || 'Edge Function'} Error:`, error);
  
  return new Response(
    JSON.stringify({
      error: error?.message || 'An unexpected error occurred',
      errorId,
      context,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
}

async function parseAndValidateRequest<T>(request: Request, requiredFields: string[] = []): Promise<T> {
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    return body as T;
  } catch (error: any) {
    throw new Error(`Request parsing failed: ${error.message}`);
  }
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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  return {
    supabase: createClient(supabaseUrl, supabaseServiceKey),
    userSupabase: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
  };
}

const EdgeLogger = {
  debug: (message: string, data?: any) => console.log(`🔍 ${message}`, data),
  info: (message: string, data?: any) => console.log(`ℹ️ ${message}`, data),
  error: (message: string, error?: any) => console.error(`❌ ${message}`, error),
};

serve(async (req) => {
  // Handle CORS preflight with shared utility
  const corsResponse = handleCORSPreflight(req);
  if (corsResponse) return corsResponse;

  try {
    const { userId, deliberationId } = await parseAndValidateRequest(req, ['userId', 'deliberationId']);

    // Get environment and clients with caching
    const { supabase } = validateAndGetEnvironment();
    const openAIApiKey = getOpenAIKey();

    // Fetch deliberation context
    const { data: deliberation } = await supabase
      .from('deliberations')
      .select('title, description, notion')
      .eq('id', deliberationId)
      .single();

    if (!deliberation) {
      throw new Error('Deliberation not found');
    }

    // Fetch all user messages for this deliberation
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('content, created_at, message_type')
      .eq('user_id', userId)
      .eq('deliberation_id', deliberationId)
      .eq('message_type', 'user') // Only analyze user messages, not agent responses
      .order('created_at', { ascending: true });

    if (messagesError) {
      throw new Error(`Failed to fetch messages: ${messagesError.message}`);
    }

    if (!messages || messages.length === 0) {
      return createSuccessResponse({
        stanceScore: 0.0,
        confidenceScore: 0.3,
        messageCount: 0,
        analysisDetails: {
          reason: 'No user messages found for analysis',
          analysisTimestamp: new Date().toISOString()
        }
      });
    }

    // Build analysis context
    const messageTexts = messages.map((msg, index) => 
      `[Message ${index + 1} - ${new Date(msg.created_at).toLocaleDateString()}]: ${msg.content}`
    ).join('\n\n');

    const deliberationContext = `Deliberation: "${deliberation.title}"
Description: ${deliberation.description || 'No description provided'}
Notion/Focus: ${deliberation.notion || 'No specific notion provided'}`;

    // Create stance analysis prompt
    const systemMessage = `You are an expert in analyzing political and social stances from written text. Your task is to analyze a user's complete message history in a deliberation and determine their overall stance on the topic.

Analyze the user's stance on a scale from -1.0 (strongly negative/opposed) to +1.0 (strongly positive/supportive), with 0.0 being neutral.

Also provide a confidence score from 0.0 (very uncertain) to 1.0 (very confident) based on:
- Clarity of expressed positions
- Consistency across messages
- Strength of language used
- Amount of content available for analysis

Return your analysis in this exact JSON format:
{
  "stanceScore": number,
  "confidenceScore": number,
  "reasoning": "Brief explanation of the stance analysis",
  "keyIndicators": ["list", "of", "key", "phrases", "or", "themes"],
  "messageCount": number,
  "analysisTimestamp": "ISO timestamp"
}`;

    const userPrompt = `${deliberationContext}

Please analyze the following messages from a user to determine their overall stance on this deliberation topic:

${messageTexts}

Total messages: ${messages.length}
Date range: ${new Date(messages[0].created_at).toLocaleDateString()} to ${new Date(messages[messages.length - 1].created_at).toLocaleDateString()}`;

    EdgeLogger.info('Analyzing user stance', { 
      userId, 
      deliberationId, 
      messageCount: messages.length 
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const result = data.choices[0].message.content;

    try {
      const parsedResult = JSON.parse(result);
      
      // Validate the parsed result has required fields
      const requiredFields = ['stanceScore', 'confidenceScore', 'reasoning'];
      const missingFields = requiredFields.filter(field => !(field in parsedResult));
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in stance analysis result: ${missingFields.join(', ')}`);
      }

      // Add analysis metadata
      const analysisResult = {
        ...parsedResult,
        messageCount: messages.length,
        analysisTimestamp: new Date().toISOString(),
        analysisDetails: {
          deliberationTitle: deliberation.title,
          dateRange: {
            start: messages[0].created_at,
            end: messages[messages.length - 1].created_at
          },
          totalContent: messageTexts.length
        }
      };
      
      EdgeLogger.info('Stance analysis completed', { 
        userId, 
        deliberationId, 
        stanceScore: analysisResult.stanceScore,
        confidenceScore: analysisResult.confidenceScore 
      });

      return createSuccessResponse(analysisResult);
      
    } catch (parseError) {
      EdgeLogger.error('JSON parsing error in stance analysis', parseError);
      console.error('Raw result:', result);
      throw new Error('Failed to parse stance analysis result as JSON');
    }

  } catch (error) {
    EdgeLogger.error('Stance calculation error', error);
    return createErrorResponse(error, 500, 'stance calculation');
  }
});