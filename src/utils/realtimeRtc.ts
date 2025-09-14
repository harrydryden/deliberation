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
    dynamicInstructions?: string;
  }) {
    this.onEvent = opts?.onEvent;
    this.onToolCall = opts?.onToolCall;

    // 1) Get ephemeral session from Edge Function with dynamic instructions
    const { data, error } = await supabase.functions.invoke('realtime_session', {
      body: { instructions: opts?.dynamicInstructions },
    });
    if (error) throw error;
    const EPHEMERAL_KEY = data?.client_secret?.value as string | undefined;
    if (!EPHEMERAL_KEY) throw new Error('Failed to get ephemeral key');

    // 2) Setup RTCPeerConnection and audio
    this.pc = new RTCPeerConnection();

    // Production-safe state change handlers
    this.pc.onconnectionstatechange = () => {
      // Connection state monitoring without logging
    };
    this.pc.oniceconnectionstatechange = () => {
      // ICE connection state monitoring without logging
    };

    // Create hidden audio element for remote playback
    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;
    this.audioEl.setAttribute('playsinline', 'true');

    this.pc.ontrack = (e) => {
      try {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      } catch (err) {
        // Track error handled silently
      }
    };
    // Mic
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // 3) Data channel for JSON events
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.addEventListener('open', () => {});
    this.dc.addEventListener('close', () => {});
    this.dc.addEventListener('message', async (e) => {
      try {
        const event = JSON.parse(e.data);
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
              // Tool handler error handled silently
            }
          }
        }
      } catch (err) {
        // Message parse error handled silently
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

    await this.waitForDataChannelOpen(12000);
  }

  private async waitForDataChannelOpen(timeoutMs = 12000): Promise<void> {
    if (this.dc?.readyState === 'open') return;
    await new Promise<void>((resolve, reject) => {
      const dc = this.dc;
      if (!dc) return reject(new Error('No data channel'));
      const onOpen = () => {
        dc.removeEventListener('open', onOpen);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        dc.removeEventListener('open', onOpen);
        reject(new Error('Data channel open timeout'));
      }, timeoutMs);
      dc.addEventListener('open', onOpen);
    });
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

  cancelSpeaking() {
    try {
      if (this.audioEl) {
        this.audioEl.muted = true;
        try { (this.audioEl as any).srcObject = null; } catch {}
        try { this.audioEl.pause(); } catch {}
      }
      if (this.dc && this.dc.readyState === 'open') {
        try { this.dc.send(JSON.stringify({ type: 'session.update', session: { turn_detection: { type: 'none' } } })); } catch {}
        try { this.dc.send(JSON.stringify({ type: 'response.cancel' })); } catch {}
      }
    } catch {}
  }

  disconnect() {
    // Hard stop speaking immediately
    this.cancelSpeaking();

    // Stop local + remote tracks and detach
    try {
      this.pc?.getSenders().forEach((s) => {
        try { s.replaceTrack(null); } catch {}
        try { s.track && s.track.stop(); } catch {}
      });
    } catch {}
    try {
      this.pc?.getReceivers().forEach((r) => {
        try { r.track && r.track.stop(); } catch {}
      });
    } catch {}
    try {
      this.localStream?.getTracks().forEach((t) => t.stop());
    } catch {}

    // Close transports
    try { this.dc?.close(); } catch {}
    try { if (this.pc && this.pc.signalingState !== 'closed') this.pc.close(); } catch {}

    // Detach and remove audio element
    try {
      if (this.audioEl) {
        this.audioEl.pause();
        (this.audioEl as any).srcObject = null;
        if (this.audioEl.parentNode) this.audioEl.parentNode.removeChild(this.audioEl);
      }
    } catch {}

    // Clear listeners
    try {
      if (this.pc) {
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
      }
    } catch {}

    this.dc = null;
    this.pc = null;
    this.localStream = null;
    this.audioEl = null;
  }
}
