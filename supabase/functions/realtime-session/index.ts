import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Supabase Edge Function: realtime-session
// Creates an ephemeral OpenAI Realtime session token with our desired defaults
// - Public (no JWT) so the web app can call it directly
// - Returns full JSON from OpenAI, including client_secret.value

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY is not set");
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional request body for future customization
    let body: any = {};
    try { body = await req.json(); } catch {}

    const model = body?.model || "gpt-4o-realtime-preview-2024-10-01"; // Keep realtime model as is - no GPT-5 realtime yet
    const voice = body?.voice || "alloy";

    const instructions =
      body?.instructions ||
      "You are a civic deliberation assistant. Always speak responses. When asked to analyse policy, first search the local agent knowledge with the 'search_knowledge' tool to ground your answer. When asked for IBIS highlights or a summary, use the 'get_ibis_context' tool and then narrate a clear, 30–60 second spoken summary. Use British English spelling and grammar throughout.";

    const sessionConfig = {
      model,
      voice,
      modalities: ["text", "audio"],
      instructions,
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 1000,
      },
      tools: [
        {
          type: "function",
          name: "search_knowledge",
          description:
            "Search the deliberation's local agent knowledge base for a query and return a concise textual digest with citations.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Natural language search query" },
              agentId: { type: "string", description: "Target local agent configuration id" },
              maxResults: { type: "number", description: "Maximum documents to retrieve", default: 5 },
            },
            required: ["query", "agentId"],
          },
        },
        {
          type: "function",
          name: "get_ibis_context",
          description:
            "Fetch key IBIS highlights (issues, positions, arguments) for a deliberation and return a compact bullet summary.",
          parameters: {
            type: "object",
            properties: {
              deliberationId: { type: "string", description: "Deliberation identifier" },
              maxItems: { type: "number", description: "Max items to include in summary", default: 10 },
            },
            required: ["deliberationId"],
          },
        },
      ],
      tool_choice: "auto",
      temperature: 0.8,
      max_response_output_tokens: "inf",
    } as const;

    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("❌ Failed to create session:", data);
      return new Response(JSON.stringify({ error: data?.error || data }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ Realtime session created", { id: data?.id, created_at: data?.created_at });
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Error in realtime-session:", error?.message || error);
    return new Response(JSON.stringify({ error: error?.message || "unknown_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
