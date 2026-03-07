// AudioWorklet processor for mic capture.
// Buffers incoming samples and posts chunks of a fixed size to the main thread.
// Replaces the deprecated ScriptProcessorNode approach.

const CHUNK_SIZE = 4096;

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer.push(channel[i]);
    }

    while (this._buffer.length >= CHUNK_SIZE) {
      const chunk = new Float32Array(this._buffer.splice(0, CHUNK_SIZE));
      this.port.postMessage(chunk, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
