import { supabase } from '@/integrations/supabase/client';

export type ToolCallEvent = { name?: string; call_id: string; arguments: string };

export class RealtimeRTC {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private onEvent?: (event: any) => void;
  private onToolCall?: (e: ToolCallEvent) => Promise<string | void> | string | void;

  constructor() {}

  async init(opts?: {
    onEvent?: (event: any) => void;
    onToolCall?: (e: ToolCallEvent) => Promise<string | void> | string | void;
  }) {
    this.onEvent = opts?.onEvent;
    this.onToolCall = opts?.onToolCall;

    // 1) Get ephemeral session from Edge Function
    const { data, error } = await supabase.functions.invoke('realtime-session', {
      body: {},
    });
    if (error) throw error;
    const EPHEMERAL_KEY = data?.client_secret?.value as string | undefined;
    if (!EPHEMERAL_KEY) throw new Error('Failed to get ephemeral key');

    // 2) Setup RTCPeerConnection and audio
    this.pc = new RTCPeerConnection();
    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;
    this.audioEl.playsInline = true;

    this.pc.ontrack = (e) => {
      try {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      } catch (err) {
        console.error('[RealtimeRTC] ontrack error', err);
      }
    };

    // Mic
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // 3) Data channel for JSON events
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.addEventListener('open', () => console.log('[RealtimeRTC] DC open'));
    this.dc.addEventListener('close', () => console.log('[RealtimeRTC] DC closed'));
    this.dc.addEventListener('message', async (e) => {
      try {
        const event = JSON.parse(e.data);
        console.log('[RTC <-]', event);
        this.onEvent?.(event);

        if (event?.type === 'response.function_call_arguments.done') {
          const call_id = (event.call_id || event.item_id || event.response_id || '').toString();
          const name = event.name || event.tool_name;
          const args = (event.arguments || '').toString();
          if (this.onToolCall && this.dc?.readyState === 'open') {
            try {
              const output = await this.onToolCall({ name, call_id, arguments: args });
              if (typeof output === 'string' && output.length > 0) {
                this.dc.send(JSON.stringify({ type: 'response.function_call_output', call_id, output }));
                this.dc.send(JSON.stringify({ type: 'response.create' }));
              }
            } catch (err) {
              console.error('[RealtimeRTC] Tool handler error', err);
            }
          }
        }
      } catch (err) {
        console.error('[RealtimeRTC] DC message parse error', err);
      }
    });

    // 4) Offer/Answer with OpenAI using ephemeral key
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = 'gpt-4o-realtime-preview-2024-10-01';

    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        'Content-Type': 'application/sdp',
      },
    });

    const answer = { type: 'answer' as RTCSdpType, sdp: await sdpResponse.text() };
    await this.pc.setRemoteDescription(answer);

    console.log('[RealtimeRTC] WebRTC connected');
  }

  sendText(text: string) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }
    const event = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    };
    this.dc.send(JSON.stringify(event));
    this.dc.send(JSON.stringify({ type: 'response.create' }));
  }

  disconnect() {
    try {
      this.dc?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    try {
      this.localStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      if (this.audioEl) {
        this.audioEl.pause();
        this.audioEl.srcObject = null;
      }
    } catch {}
    this.dc = null;
    this.pc = null;
    this.localStream = null;
  }
}
