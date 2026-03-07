// AudioWorklet processor for mic capture.
// Buffers incoming samples and posts chunks of a fixed size to the main thread.
// Replaces the deprecated ScriptProcessorNode approach.
//
// Uses a pre-allocated Float32Array to avoid GC pressure in the audio thread.
// The filled buffer is transferred (zero-copy) to the main thread and a fresh
// one is allocated immediately after — keeping allocations out of the hot path.

const CHUNK_SIZE = 4096;

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(CHUNK_SIZE);
    this._writePos = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    let i = 0;
    while (i < channel.length) {
      const space   = CHUNK_SIZE - this._writePos;
      const toCopy  = Math.min(space, channel.length - i);
      this._buffer.set(channel.subarray(i, i + toCopy), this._writePos);
      this._writePos += toCopy;
      i += toCopy;

      if (this._writePos >= CHUNK_SIZE) {
        const chunk = this._buffer;
        this.port.postMessage(chunk, [chunk.buffer]); // zero-copy transfer
        this._buffer   = new Float32Array(CHUNK_SIZE);
        this._writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
