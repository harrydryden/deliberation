import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecorder, encodeAudioForAPI, ensureAudioQueue, base64ToBytes } from '@/utils/realtimeAudio';

// Open a WebSocket to the Supabase Edge Function relay
// IMPORTANT: Use full URL, not env vars
const FUNCTION_WS = 'wss://iowsxuxkgvpgrvvklwyt.functions.supabase.co/functions/v1/realtime-chat';

export interface RealtimeEvent {
  type: string;
  [key: string]: any;
}

export const useRealtimeChat = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const toolHandlerRef = useRef<null | ((e: { name?: string; call_id: string; arguments: string }) => Promise<string | void> | string | void)>(null);
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');

  const connect = useCallback(async (opts?: { onToolCall?: (e: { name?: string; call_id: string; arguments: string }) => Promise<string | void> | string | void }) => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        toolHandlerRef.current = opts?.onToolCall || null;
        return;
      }
      if (wsRef.current.readyState === WebSocket.CONNECTING) {
        toolHandlerRef.current = opts?.onToolCall || null;
        await new Promise<void>((resolve) => {
          const handler = () => {
            wsRef.current?.removeEventListener('open', handler as any);
            resolve();
          };
          wsRef.current?.addEventListener('open', handler as any);
        });
        return;
      }
    }

    console.log('[Realtime] Connecting WS ->', FUNCTION_WS);
    const ws = new WebSocket(FUNCTION_WS);
    wsRef.current = ws;

    toolHandlerRef.current = opts?.onToolCall || null;

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        console.log('[Realtime] WS connected');
        setConnected(true);
        // Ensure AudioQueue exists for playback
        ensureAudioQueue();
        resolve();
      };
    });

    ws.onmessage = async (event) => {
      try {
        if (typeof event.data !== 'string') return;
        const data: RealtimeEvent = JSON.parse(event.data);
        // Debug all incoming events
        console.log('[Realtime <-]', data);

        if (data.type === 'response.audio.delta') {
          const bytes = base64ToBytes(data.delta);
          const { queue } = ensureAudioQueue();
          await queue.addToQueue(bytes);
          setSpeaking(true);
        } else if (data.type === 'response.audio.done') {
          setSpeaking(false);
        } else if (data.type === 'response.audio_transcript.delta') {
          // Stream partial transcript
          setTranscript((t) => t + data.delta);
        } else if (data.type === 'response.audio_transcript.done') {
          // Optionally finalize transcript
          setTranscript((t) => t + '\n');
        } else if (data.type === 'response.function_call_arguments.delta') {
          // Tool call arguments streaming
          console.log('[Tool Delta]', data.delta);
        } else if (data.type === 'response.function_call_arguments.done') {
          // Tool call completed with full arguments
          const call_id = (data.call_id || data.item_id || data.response_id || '').toString();
          const name = (data.name || data.tool_name);
          const args = (data.arguments || '').toString();
          console.log('[Tool Done]', { name, call_id, args });
          if (toolHandlerRef.current && wsRef.current) {
            try {
              const output = await toolHandlerRef.current({ name, call_id, arguments: args });
              if (typeof output === 'string' && output.length > 0) {
                const evt = { type: 'response.function_call_output', call_id, output } as const;
                wsRef.current.send(JSON.stringify(evt));
              }
            } catch (err) {
              console.error('[Tool Handler] error', err);
            }
          }
        }
      } catch (err) {
        console.error('[Realtime] onmessage error', err);
      }
    };

    ws.onerror = (e) => {
      console.error('[Realtime] WS error', e);
    };

    ws.onclose = (e) => {
      console.log('[Realtime] WS closed', e.code, e.reason);
      setConnected(false);
      setSpeaking(false);
      wsRef.current = null;
    };
  }, []);

  const disconnect = useCallback(() => {
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Realtime] WS is not open, connecting first');
      await connect();
    }
    const ws = wsRef.current!;
    recorderRef.current = new AudioRecorder((float32) => {
      try {
        // Encode and send immediately; do not wait for buffers (server VAD)
        const b64 = encodeAudioForAPI(float32);
        const evt = { type: 'input_audio_buffer.append', audio: b64 };
        ws.send(JSON.stringify(evt));
        // NOTE: Do NOT commit when using server VAD
      } catch (err) {
        console.error('[Realtime] Failed to send audio chunk', err);
      }
    });
    await recorderRef.current.start();
  }, [connect]);

  const stopMic = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    const ws = wsRef.current!;
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    };
    ws.send(JSON.stringify(event));
    // With audio server VAD we typically wait, but for text we can prompt a response
    ws.send(JSON.stringify({ type: 'response.create' }));
  }, [connect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    connected,
    speaking,
    transcript,
    connect,
    disconnect,
    startMic,
    stopMic,
    sendText,
  };
};
