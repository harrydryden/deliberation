import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.1";
import { PromptTemplateService } from "../_shared/prompt-template-service.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Realtime session function called:', req.method, req.url);
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      throw new Error('OPENAI_API_KEY is not set');
    }

    // Initialize Supabase client and prompt service
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const promptService = new PromptTemplateService(supabase);

    // Get optional instructions from request body and use template service
    let instructions = "You are a helpful AI assistant."; // Fallback
    let deliberationSize = 'medium'; // Default
    let body = {}; // Initialize body to prevent reference errors
    
    try {
      body = await req.json();
      console.log('Request body:', body);
      if (body?.instructions) {
        instructions = body.instructions;
      }
      if (body?.deliberationSize) {
        deliberationSize = body.deliberationSize;
      }
    } catch (error) {
      console.log('No request body or failed to parse, using defaults:', error.message);
    }

    // Use PromptTemplateService to get voice interface instructions
    const templateName = `voice_interface_${deliberationSize}`;
    const { prompt: templateInstructions, isTemplate } = await promptService.generatePrompt(
      templateName,
      {
        deliberation_context: body?.deliberationContext || 'general discussion',
        user_guidelines: body?.userGuidelines || 'standard voice interaction guidelines'
      },
      instructions
    );

    // Use template instructions if available, otherwise fall back to provided/default
    instructions = templateInstructions;
    
    console.log(`Using ${isTemplate ? 'template' : 'fallback'} instructions for voice interface:`, templateName);

    console.log('Creating OpenAI realtime session with instructions:', instructions.substring(0, 100));

    // Request an ephemeral token from OpenAI
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-10-01",
        voice: "alloy",
        instructions: instructions,
        modalities: ["text", "audio"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 1000
        },
        tools: [
          {
            type: "function",
            name: "search_knowledge",
            description: "Search for information in the knowledge base",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" },
                agentId: { type: "string" },
                maxResults: { type: "number" }
              },
              required: ["query"]
            }
          },
          {
            type: "function", 
            name: "get_ibis_context",
            description: "Get IBIS deliberation context for summary generation",
            parameters: {
              type: "object",
              properties: {
                deliberationId: { type: "string" },
                maxItems: { type: "number" }
              }
            }
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, response.statusText, errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log("OpenAI session created successfully:", data?.client_secret ? 'Got client secret' : 'No client secret');

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error creating realtime session:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString() 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});