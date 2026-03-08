export class AudioStreamer {
  audioContext: AudioContext;
  nextTime: number = 0;
  activeSources: AudioBufferSourceNode[] = [];
  /** 1.0 = normal; was 1.2 which caused underruns and crackling */
  playbackRate: number = 1.0;

  /** Min samples (at 24kHz) to buffer before starting playback (~120ms) */
  private static readonly PREBUFFER_SAMPLES = 24000 * 0.12;
  private prebuffer: number[] = [];
  /** Once we've played the first buffer, stream subsequent chunks directly */
  private prebufferDone = false;

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
  }

  private decodeBase64ToFloat32(base64Audio: string): Float32Array {
    const binary_string = window.atob(base64Audio);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  }

  private flushPrebuffer() {
    if (this.prebuffer.length === 0) return;
    this.prebufferDone = true;
    const samples = new Float32Array(this.prebuffer.length);
    for (let i = 0; i < this.prebuffer.length; i++) samples[i] = this.prebuffer[i];
    this.prebuffer = [];
    this.scheduleBuffer(samples);
  }

  private scheduleBuffer(float32Array: Float32Array) {
    const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    // Schedule immediately when behind (no 20ms gap) to avoid choppy silence
    if (this.nextTime < currentTime) {
      this.nextTime = currentTime;
    }

    source.start(this.nextTime);
    this.nextTime += audioBuffer.duration / this.playbackRate;

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
    };
  }

  addPcmData(base64Audio: string) {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const float32Array = this.decodeBase64ToFloat32(base64Audio);

    // Pre-buffer once at start to smooth jitter; then stream all later chunks
    if (!this.prebufferDone && this.prebuffer.length < AudioStreamer.PREBUFFER_SAMPLES) {
      for (let i = 0; i < float32Array.length; i++) {
        this.prebuffer.push(float32Array[i]);
      }
      if (this.prebuffer.length >= AudioStreamer.PREBUFFER_SAMPLES) {
        this.flushPrebuffer();
      }
      return;
    }

    this.scheduleBuffer(float32Array);
  }

  stop() {
    this.prebuffer = [];
    this.prebufferDone = false;
    this.activeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    });
    this.activeSources = [];
    this.nextTime = 0;
  }

  close() {
    this.stop();
    this.audioContext.close();
  }
}

export class AudioRecorder {
  audioContext: AudioContext | null = null;
  stream: MediaStream | null = null;
  workletNode: AudioWorkletNode | null = null;
  sourceNode: MediaStreamAudioSourceNode | null = null;
  onData: (base64: string) => void;

  constructor(onData: (base64: string) => void) {
    this.onData = onData;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    } });
    this.audioContext = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });

    const workletCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = new Int16Array(2048);
          this.offset = 0;
        }
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input.length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
              let s = Math.max(-1, Math.min(1, channelData[i]));
              this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

              if (this.offset >= this.buffer.length) {
                this.port.postMessage(this.buffer.buffer.slice(0), [this.buffer.buffer.slice(0)]);
                this.offset = 0;
              }
            }
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    await this.audioContext.audioWorklet.addModule(url);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    this.workletNode.port.onmessage = (event) => {
      const arrayBuffer = event.data;
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = window.btoa(binary);
      this.onData(base64);
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  stop() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
