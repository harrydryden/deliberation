// Utilities for OpenAI Realtime audio over WebSocket
// - AudioRecorder streams 24kHz mono PCM from mic
// - encodeAudioForAPI converts Float32 -> Base64 PCM16LE
// - WAV creation for playback from PCM chunks
// - AudioQueue ensures sequential, gapless playback with error recovery

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };
      this.source.connect(this.processor);
      // Do not connect to destination to avoid unnecessary playback load
    } catch (error) {
      throw error;
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const encodeAudioForAPI = (float32Array: Float32Array): string => {
  // Convert Float32 [-1,1] to PCM16 LE
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
};

export const createWavFromPCM = (pcmBytes: Uint8Array) => {
  // pcmBytes expected as PCM16LE at 24kHz mono
  // Build standard 44-byte WAV header
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8; // 2
  const byteRate = sampleRate * blockAlign; // 48000

  const dataSize = pcmBytes.byteLength;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // file size - 8
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Audio format PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(buffer), 0);
  wav.set(pcmBytes, 44);
  return wav;
};

class AudioQueue {
  private queue: Uint8Array[] = [];
  private isPlaying = false;
  constructor(private audioContext: AudioContext) {}

  async addToQueue(pcmBytes: Uint8Array) {
    this.queue.push(pcmBytes);
    if (!this.isPlaying) await this.playNext();
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    const pcm = this.queue.shift()!;
    try {
      const wavData = createWavFromPCM(pcm);
      const audioBuffer = await this.audioContext.decodeAudioData(wavData.buffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.onended = () => this.playNext();
      source.start(0);
    } catch (err) {
      // Continue with next chunk even if this one fails
      this.playNext();
    }
  }
}

let audioQueueInstance: { queue: AudioQueue; ctx: AudioContext } | null = null;
export const ensureAudioQueue = () => {
  if (!audioQueueInstance) {
    const ctx = new AudioContext();
    audioQueueInstance = { queue: new AudioQueue(ctx), ctx };
  }
  return audioQueueInstance;
};

export const base64ToBytes = (b64: string) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
