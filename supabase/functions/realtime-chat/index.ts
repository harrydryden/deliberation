import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Supabase Edge Function: realtime-chat
// Bridges client WebSocket to OpenAI Realtime API securely.
// - Waits for session.created then sends session.update
// - Forwards all events both ways
// - Logs verbosely for debugging

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400, headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  // Connect to OpenAI Realtime API
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    console.error("❌ Missing OPENAI_API_KEY env var");
  }

  const openAIUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
  let sessionCreated = false;

  // Create upstream WebSocket to OpenAI
  let upstream: WebSocket | null = null;
  try {
    // @ts-ignore Deno allows headers in the WebSocket init in Edge runtime
    upstream = new WebSocket(openAIUrl, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });
  } catch (e) {
    console.error("❌ Failed to connect to OpenAI Realtime:", e);
  }

  if (!upstream) {
    socket.close(1011, "Failed to connect to upstream");
    return response;
  }

  // Wire OpenAI -> Client
  upstream.onopen = () => {
    console.log("✅ Connected to OpenAI Realtime");
  };
  upstream.onmessage = (evt) => {
    try {
      if (typeof evt.data === "string") {
        const msg = evt.data as string;
        // Detect session.created then immediately send session.update
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.type === "session.created" && !sessionCreated) {
            sessionCreated = true;
            console.log("🧭 session.created received, sending session.update");
            const update = {
              event_id: `event_${crypto.randomUUID()}`,
              type: "session.update",
              session: {
                modalities: ["text", "audio"],
                instructions:
                  "You are a civic deliberation assistant. Always speak responses. When asked to analyze policy, first search the local agent knowledge with the 'search_knowledge' tool to ground your answer. When asked for IBIS highlights or a summary, use the 'get_ibis_context' tool and then narrate a clear, 30–60 second spoken summary.",
                voice: "alloy",
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
                        maxResults: { type: "number", description: "Maximum documents to retrieve", default: 5 }
                      },
                      required: ["query", "agentId"]
                    }
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
                        maxItems: { type: "number", description: "Max items to include in summary", default: 10 }
                      },
                      required: ["deliberationId"]
                    }
                  }
                ],
                tool_choice: "auto",
                temperature: 0.8,
                max_response_output_tokens: "inf",
              },
            };
            upstream?.send(JSON.stringify(update));
          }
        } catch (_) {
          // Not JSON or not a session event, ignore parsing error
        }
        socket.send(msg);
      } else if (evt.data instanceof ArrayBuffer) {
        // Binary passthrough
        socket.send(evt.data);
      }
    } catch (err) {
      console.error("❌ Error relaying OpenAI -> Client: ", err);
    }
  };
  upstream.onerror = (e) => {
    console.error("❌ Upstream error:", e);
    try { socket.send(JSON.stringify({ type: "error", message: "upstream_error" })); } catch {}
  };
  upstream.onclose = (e) => {
    console.log("🔌 Upstream closed:", e.code, e.reason);
    try { socket.close(e.code, e.reason); } catch {}
  };

  // Wire Client -> OpenAI
  socket.onopen = () => {
    console.log("🧑‍💻 Client connected to relay");
  };
  socket.onmessage = (evt) => {
    try {
      if (typeof evt.data === "string") {
        // Forward as-is
        upstream?.send(evt.data);
      } else if (evt.data instanceof ArrayBuffer) {
        upstream?.send(evt.data);
      }
    } catch (err) {
      console.error("❌ Error relaying Client -> OpenAI:", err);
    }
  };
  socket.onerror = (e) => {
    console.error("❌ Client socket error:", e);
  };
  socket.onclose = (e) => {
    console.log("🔌 Client closed:", e.code, e.reason);
    try { upstream?.close(e.code, e.reason); } catch {}
  };

  return response;
});
