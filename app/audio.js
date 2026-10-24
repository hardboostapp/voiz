import { ConversionQueue } from './conversion-queue.mjs';
import { WINDOWS_MONITOR } from './monitor-output.mjs';
export class AudioMixer {
  constructor(api, changed) {
    this.api = api; this.changed = changed; this.ctx = null; this.stream = null; this.sources = new Map(); this.pendingSounds = new Set(); this.cache = new Map(); this.generation = 0; this.playGeneration = 0; this.inflight = false; this.starting = false; this.active = false;
    this.volumes = { micVolume: 1, soundVolume: .8, masterVolume: .8 };
    this.soundSendEnabled = true;
    this.monitorSources = new Map(); this.monitorEnabled = false; this.voiceMonitorEnabled = false; this.monitorOutputId = ''; this.monitorGeneration = 0; this.monitorError = '';
  }
  async open(outputId) {
    if (!outputId) throw new Error('Escolha uma saída de áudio primeiro.');
    if (this.opening) await this.opening;
    if (this.ctx) { if (this.outputId !== outputId) throw new Error('Pare o áudio antes de trocar a saída.'); await this.ctx.resume(); return; }
    this.opening = this.createOutput(outputId);
    try { await this.opening; } catch (error) { const failed = this.ctx; this.ctx = null; if (failed && failed.state !== 'closed') await failed.close(); throw error; } finally { this.opening = null; }
  }
  async createOutput(outputId) {
    this.outputId = outputId;
    this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive', sinkId: outputId });
    if (!('sinkId' in this.ctx)) { await this.ctx.close(); this.ctx = null; throw new Error('Este runtime não suporta seleção de saída.'); }
    this.voiceGain = this.ctx.createGain(); this.soundGain = this.ctx.createGain(); this.master = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor(); this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = .003; this.limiter.release.value = .1;
    this.meter = this.ctx.createAnalyser(); this.meter.fftSize = 256;
    this.voiceGain.connect(this.master); this.soundGain.connect(this.master); this.master.connect(this.limiter); this.limiter.connect(this.meter); this.meter.connect(this.ctx.destination);
    this.setVolumes(this.volumes);
    const context = this.ctx;
    await context.audioWorklet.addModule('./audio-worklet.js');
    if (context !== this.ctx || context.state === 'closed') throw new Error('Saída alterada durante a preparação. Tente novamente.');
    await context.resume();
    this.ctx.addEventListener('sinkchange', () => { if (this.ctx && this.ctx.sinkId !== this.outputId) { this.stopAll(); this.changed({ error: 'A saída mudou. Selecione o dispositivo novamente.' }); } });
  }
  setVolumes(values) { Object.assign(this.volumes, values); if (this.ctx) { this.voiceGain.gain.value = this.volumes.micVolume; this.soundGain.gain.value = this.soundSendEnabled ? this.volumes.soundVolume : 0; this.master.gain.value = this.volumes.masterVolume; } if (this.monitorBus) this.monitorBus.gain.value = this.volumes.soundVolume; if (this.monitorMaster) this.monitorMaster.gain.value = this.volumes.masterVolume; }
  async setSoundSend(enabled) {
    const next = !!enabled;
    if (next === this.soundSendEnabled) return;
    this.soundSendEnabled = next; this.setVolumes({});
    await this.setMonitor({enabled:this.monitorEnabled,voiceEnabled:this.voiceMonitorEnabled,outputId:this.monitorOutputId,resolvedOutputId:this.monitorResolvedOutputId || '',force:true});
  }
  sameMonitorOutput() { return this.monitorOutputId === this.outputId || (!!this.monitorResolvedOutputId && this.monitorResolvedOutputId === this.outputId); }
  async setMonitor({ enabled, voiceEnabled = this.voiceMonitorEnabled, outputId = '', resolvedOutputId = '', force = false }) {
    const nextId = String(outputId);
    if (!force && this.monitorEnabled === !!enabled && this.voiceMonitorEnabled === !!voiceEnabled && this.monitorOutputId === nextId && this.monitorResolvedOutputId === resolvedOutputId) return;
    this.monitorEnabled = !!enabled; this.voiceMonitorEnabled = !!voiceEnabled; this.monitorOutputId = nextId; this.monitorResolvedOutputId = resolvedOutputId; this.monitorError = '';
    await this.closeMonitor();
    if (this.sources.size || this.active) {
      await this.ensureMonitor();
      for (const [id, source] of this.sources) this.monitorSound(id, source.buffer, source.voizVolume, Math.max(0, this.ctx.currentTime - source.voizStartedAt));
      this.connectVoiceMonitor();
    }
  }
  disconnectVoiceMonitor() {
    this.monitorVoiceSource?.disconnect(); this.monitorVoiceSource = null;
    if (this.voiceMonitorDestination) {
      try { this.voiceGain.disconnect(this.voiceMonitorDestination); } catch {}
      this.voiceMonitorDestination.stream.getTracks().forEach(track => track.stop()); this.voiceMonitorDestination = null;
    }
  }
  connectVoiceMonitor() {
    this.disconnectVoiceMonitor();
    if (!this.active || !this.voiceMonitorEnabled || !this.monitorMaster || this.sameMonitorOutput()) return;
    // This tap is after conversion and mic gain, never from the dry input stream.
    this.voiceMonitorDestination = this.ctx.createMediaStreamDestination();
    this.voiceGain.connect(this.voiceMonitorDestination);
    this.monitorVoiceSource = this.monitorContext.createMediaStreamSource(this.voiceMonitorDestination.stream);
    this.monitorVoiceSource.connect(this.monitorMaster);
  }
  async closeMonitor() {
    this.monitorGeneration++; this.monitorOpening = null;
    this.disconnectVoiceMonitor();
    for (const id of [...this.monitorSources.keys()]) this.stopMonitorSound(id);
    const context = this.monitorContext; this.monitorContext = null; this.monitorBus = null; this.monitorMaster = null;
    if (context && context.state !== 'closed') await context.close();
  }
  async ensureMonitor() {
    if ((!this.monitorEnabled && !this.voiceMonitorEnabled) || !this.monitorOutputId || (this.sameMonitorOutput() && (this.soundSendEnabled || !this.monitorEnabled))) return;
    if (this.monitorContext?.state === 'running') return;
    if (this.monitorContext?.state === 'suspended') { try { await this.monitorContext.resume(); return; } catch { await this.closeMonitor(); } }
    if (this.monitorOpening) return this.monitorOpening;
    // An empty native sink follows the Windows default instead of pinning one device.
    const token = this.monitorGeneration, target = this.monitorOutputId === WINDOWS_MONITOR ? '' : this.monitorOutputId;
    const work = (async () => {
      let context;
      try {
        context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive', sinkId: target });
        if (!('sinkId' in context)) throw new Error('Este runtime não suporta seleção de saída.');
        this.monitorContext = context;
        const bus = context.createGain(), master = context.createGain(), limiter = context.createDynamicsCompressor();
        bus.gain.value = this.volumes.soundVolume; master.gain.value = this.volumes.masterVolume;
        limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .1;
        bus.connect(master); master.connect(limiter); limiter.connect(context.destination);
        await context.resume();
        if (token !== this.monitorGeneration || context !== this.monitorContext) { if (context.state !== 'closed') await context.close(); return; }
        this.monitorBus = bus; this.monitorMaster = master; this.monitorError = '';
        context.addEventListener('sinkchange', () => {
          if (context === this.monitorContext && context.sinkId !== target) {
            this.closeMonitor().catch(() => {});
            this.monitorError = 'A saída de retorno mudou. Escolha seu fone em Ouvir em, no Soundboard.';
            this.changed({ monitorError: this.monitorError });
          }
        });
      } catch (error) {
        if (context && context.state !== 'closed') await context.close().catch(() => {});
        if (context === this.monitorContext) { this.monitorContext = null; this.monitorBus = null; this.monitorMaster = null; }
        if (token === this.monitorGeneration) { this.monitorError = 'Não foi possível abrir o retorno. Escolha seu fone em Ouvir em, no Soundboard. A saída da call continua ativa.'; this.changed({ monitorError: this.monitorError }); }
      }
    })();
    this.monitorOpening = work;
    try { await work; } finally { if (this.monitorOpening === work) this.monitorOpening = null; }
  }
  stopMonitorSound(id) {
    const source = this.monitorSources.get(id); if (!source) return;
    this.monitorSources.delete(id); try { source.stop(); } catch {}
  }
  monitorSound(id, buffer, volume, offset = 0) {
    if (!this.monitorBus || !this.monitorEnabled || (this.sameMonitorOutput() && this.soundSendEnabled) || this.monitorSources.has(id) || offset >= buffer.duration) return;
    const source = this.monitorContext.createBufferSource(), gain = this.monitorContext.createGain();
    source.buffer = buffer; gain.gain.value = volume; source.connect(gain); gain.connect(this.monitorBus);
    source.onended = () => { if (this.monitorSources.get(id) === source) this.monitorSources.delete(id); source.disconnect(); gain.disconnect(); };
    this.monitorSources.set(id, source); source.start(0, offset);
  }
  async play(sound, outputId) {
    if (this.sources.has(sound.id)) { this.sources.get(sound.id).stop(); this.sources.delete(sound.id); this.stopMonitorSound(sound.id); this.changed({ playing: [...this.sources.keys()] }); return; }
    if (this.pendingSounds.has(sound.id)) return;
    const token = this.playGeneration; this.pendingSounds.add(sound.id);
    try {
      await this.open(outputId);
      await this.ensureMonitor();
      let buffer = this.cache.get(sound.id);
      if (!buffer) {
        const raw = await this.api.bytes(sound.id); const bytes = new Uint8Array(raw);
        buffer = await this.ctx.decodeAudioData(bytes.buffer);
        if (buffer.length * buffer.numberOfChannels * 4 > 128 * 1024 * 1024) throw new Error('Áudio muito longo. Importe um trecho menor.');
        this.cache.set(sound.id, buffer);
        while ([...this.cache.values()].reduce((n, b) => n + b.length * b.numberOfChannels * 4, 0) > 160 * 1024 * 1024) this.cache.delete(this.cache.keys().next().value);
      }
      if (token !== this.playGeneration) return;
      if (this.sources.size >= 8) throw new Error('Já há 8 sons tocando. Pare um antes de tocar outro.');
      const source = this.ctx.createBufferSource(); const gain = this.ctx.createGain();
      source.buffer = buffer; gain.gain.value = sound.volume; source.connect(gain); gain.connect(this.soundGain);
      source.onended = () => { if (this.sources.get(sound.id) === source) { this.sources.delete(sound.id); this.stopMonitorSound(sound.id); } source.disconnect(); gain.disconnect(); this.changed({ playing: [...this.sources.keys()] }); };
      source.voizStartedAt = this.ctx.currentTime; source.voizVolume = sound.volume;
      this.sources.set(sound.id, source); source.start(); this.monitorSound(sound.id, buffer, sound.volume); this.changed({ playing: [...this.sources.keys()] });
    } finally { this.pendingSounds.delete(sound.id); }
  }
  stopSounds() { this.playGeneration++; for (const source of this.sources.values()) { try { source.stop(); } catch {} } this.sources.clear(); for (const id of [...this.monitorSources.keys()]) this.stopMonitorSound(id); this.changed({ playing: [] }); }
  async startMic(inputId, outputId, voice, tuning = {}) {
    if (this.active || this.starting) return;
    if (!inputId) throw new Error('Escolha seu microfone.');
    const token = ++this.generation; this.starting = true;
    try {
      const profile = voice !== 'normal' ? await this.api.prepare(voice, tuning) : null;
      if (token !== this.generation) return;
      await this.open(outputId);
      if (token !== this.generation) return;
      await this.api.arm();
      if (token !== this.generation) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: inputId }, channelCount: 1, sampleRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (token !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      await this.api.disarm();
      if (token !== this.generation) return;
      stream.getAudioTracks()[0].onended = () => { this.stopMic(); this.changed({ error: 'Microfone desconectado. Conecte-o e atualize os dispositivos.' }); };
      this.input = this.ctx.createMediaStreamSource(stream);
      this.inputGain = this.ctx.createGain(); this.inputGain.gain.value = Math.max(.5, Math.min(4, Number(tuning.inputGain) || 1)); this.input.connect(this.inputGain);
      if (voice === 'normal') this.inputGain.connect(this.voiceGain);
      else {
        this.worklet = new AudioWorkletNode(this.ctx, 'voiz-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { chunkSamples: profile?.chunkSamples || 19200 } });
        this.inputGain.connect(this.worklet); this.worklet.connect(this.voiceGain);
        const failed = error => { if (token === this.generation) { this.stopMic(); this.changed({ error: error.message }); } };
        this.conversions = new ConversionQueue(samples => this.api.convert(samples, voice), result => {
          if (token === this.generation) { this.worklet.port.postMessage({ samples: result.samples }); this.changed({ ms: result.ms }); }
        }, failed);
        this.worklet.port.onmessage = ({ data }) => {
          if (token !== this.generation) return;
          if (data.error) { failed(new Error(data.error)); return; }
          if ('buffering' in data) this.changed({ buffering: data.buffering });
          if (data.samples) { this.changed({ inputDb: data.inputDb, inputPeak: data.inputPeak }); this.conversions.push(data.samples); }
        };
      }
      this.active = true; await this.ensureMonitor();
      if (token !== this.generation) return;
      this.connectVoiceMonitor(); this.changed({ mic: true });
    } catch (error) { if (token === this.generation) { this.stopMic(); throw error; } }
    finally { if (token === this.generation) { this.starting = false; this.api.disarm(); } }
  }
  stopMic() {
    this.generation++; this.starting = false; this.active = false;
    this.disconnectVoiceMonitor();
    this.conversions?.close(); this.conversions = null;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.port.postMessage({ reset: true }); this.worklet.disconnect(); this.worklet = null; }
    this.input?.disconnect(); this.input = null;
    this.inputGain?.disconnect(); this.inputGain = null;
    if (this.stream) { for (const track of this.stream.getTracks()) { track.onended = null; track.stop(); } this.stream = null; }
    this.api.disarm(); this.changed({ mic: false });
  }
  stopAll() { this.stopMic(); this.stopSounds(); }
  async resetOutput() { this.stopAll(); await this.closeMonitor(); const old = this.ctx; this.ctx = null; if (old) await old.close(); this.cache.clear(); }
  level() { if (!this.ctx || !this.meter) return 0; const data = new Float32Array(256); this.meter.getFloatTimeDomainData(data); return Math.min(1, Math.sqrt(data.reduce((n, s) => n + s * s, 0) / data.length) * 3); }
}
