class VoizProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super(); const settings = options.processorOptions || {};
    this.chunkSamples = [9600, 15360, 19200].includes(settings.chunkSamples) ? settings.chunkSamples : 19200;
    this.initialReserve = 4800; this.maximumReserve = 9600; this.maximumQueued = 96000; this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.reset) this.reset();
      if (!this.fault && data.samples?.length) {
        if (this.queued + data.samples.length > this.maximumQueued) {
          this.fault = true; this.queue = []; this.queued = 0;
          this.port.postMessage({ error: 'A reprodução acumulou atraso. Ative o microfone novamente.' }); return;
        }
        this.queue.push(data.samples); this.queued += data.samples.length;
      }
    };
  }
  reset() {
    this.capture = new Float32Array(this.chunkSamples); this.position = 0; this.squareSum = 0; this.peak = 0;
    this.queue = []; this.readPosition = 0; this.queued = 0; this.playing = false; this.fault = false;
    this.reserveSamples = this.initialReserve; this.startupRemaining = this.reserveSamples; this.fadeIn = 0; this.fadeOut = 0; this.lastSample = 0;
    this.statisticsFrames = 0; this.underruns = 0; this.rebuffering = false;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0], output = outputs[0]?.[0];
    if (this.fault) { output?.fill(0); return true; }
    if (input) {
      for (let i = 0; i < input.length; i++) {
        const sample = input[i]; this.capture[this.position++] = sample; this.squareSum += sample * sample; this.peak = Math.max(this.peak, Math.abs(sample));
        if (this.position === this.capture.length) {
          this.port.postMessage({ samples: this.capture, inputDb: 20 * Math.log10(Math.max(1e-10, Math.sqrt(this.squareSum / this.capture.length))), inputPeak: this.peak }, [this.capture.buffer]);
          this.capture = new Float32Array(this.chunkSamples); this.position = 0; this.squareSum = 0; this.peak = 0;
        }
      }
    }
    if (output) for (let i = 0; i < output.length; i++) {
      if (!this.queued && this.playing) {
        this.reserveSamples = Math.min(this.maximumReserve, this.reserveSamples + 2400);
        this.playing = false; this.startupRemaining = this.reserveSamples; this.underruns++; this.rebuffering = true; this.fadeOut = 64;
        this.port.postMessage({ buffering: true, underruns: this.underruns });
      }
      if (!this.playing) {
        if (this.queued && this.startupRemaining-- <= 0) {
          this.playing = true; this.fadeIn = 0;
          if (this.rebuffering) { this.rebuffering = false; this.port.postMessage({ buffering: false, underruns: this.underruns }); }
        } else { output[i] = this.fadeOut > 0 ? this.lastSample * (this.fadeOut-- / 64) : 0; continue; }
      }
      output[i] = this.queue[0][this.readPosition++] * Math.min(1, ++this.fadeIn / 64); this.lastSample = output[i]; this.queued--;
      if (this.readPosition >= this.queue[0].length) { this.queue.shift(); this.readPosition = 0; }
    }
    return true;
  }
}
registerProcessor('voiz-processor', VoizProcessor);
