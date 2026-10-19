const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { voiceById, modelReady } = require('./voices.cjs');
const { PROFILE, normalizeTuning } = require('./audio-profile.cjs');
const { engineExecutable } = require('./installation.cjs');
const BASE = 'http://127.0.0.1:18001';
class Engine {
  constructor(root, notify = () => {}) {
    this.root = root; this.notify = notify; this.child = null; this.ready = false;
    this.busy = false; this.voiceId = null; this.epoch = 0;
    this.queue = Promise.resolve(); this.lifetime = new AbortController();
  }
  async request(route, options = {}, timeout = 5000) {
    try { return await fetch(BASE + route, { ...options, signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(timeout)]) }); }
    catch (error) {
      if (this.lifetime.signal.aborted) throw new Error('O motor foi encerrado. Ative o microfone para tentar novamente.');
      if (error.name === 'TimeoutError') throw new Error('O motor demorou para responder. Ative o microfone para tentar novamente; se persistir, abra os logs.');
      throw error;
    }
  }
  async json(route, options = {}, timeout = 5000) {
    const result = await this.request(route, options, timeout);
    if (!result.ok) throw new Error(`Motor de voz: HTTP ${result.status}.`);
    return result.json();
  }
  prepare(id = 'lula', input = {}) {
    const voice = voiceById(id);
    if (voice.kind !== 'rvc' || !modelReady(this.root, voice)) return Promise.reject(new Error(`O modelo ${voice.name} não está instalado corretamente.`));
    const epoch = this.epoch;
    const tuning = normalizeTuning({ ...voice.defaultTuning, ...input });
    // Serialize changes when a user cancels activation and chooses another voice.
    const work = this.queue.catch(() => {}).then(async () => {
      this.assertCurrent(epoch);
      await this._prepare(voice, epoch, tuning);
      return { chunkSamples: PROFILE.chunkSamples };
    }).catch(error => { if (epoch === this.epoch) this.stop(); throw error; });
    this.queue = work;
    return work;
  }
  assertCurrent(epoch) { if (epoch !== this.epoch) throw new Error('Preparação cancelada.'); }
  async start(epoch) {
    if (this.child) return;
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
    const exe = engineExecutable(this.root);
    if (!fs.existsSync(exe)) throw new Error('Motor de voz não instalado. Execute Preparar vozes.cmd na pasta do Voiz.');
    let existing;
    try { existing = await this.json('/openapi.json', {}, 1000); } catch {}
    this.assertCurrent(epoch);
    if (existing) throw new Error('A porta 18001 está ocupada. Feche a outra instância do motor do Voiz e tente novamente.');
    fs.mkdirSync(path.join(this.root, 'logs'), { recursive: true });
    const log = fs.openSync(path.join(this.root, 'logs/engine.log'), 'a');
    const child = spawn(exe, ['cui', '--host', '127.0.0.1', '--port', '18001', '--https', 'False', '--launch_client', 'False', '--no_cui', 'True'], { cwd: path.join(this.root, 'engine'), windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log); this.child = child;
    let failed;
    child.once('error', error => { failed = error; });
    child.once('exit', () => {
      if (this.child !== child) return;
      this.child = null; this.ready = false; this.voiceId = null;
      this.notify({ state: 'offline', message: 'Motor encerrado.' });
    });
    // The bundled executable extracts its runtime on a cold start.
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      this.assertCurrent(epoch);
      if (failed) throw failed;
      if (!this.child) throw new Error('O motor encerrou durante a preparação. Consulte logs/engine.log.');
      let schema;
      try { schema = await this.json('/openapi.json', {}, 1500); } catch {}
      if (schema) {
        if (!schema.paths?.['/api/voice-changer/convert_chunk']?.post || !schema.paths?.['/api/configuration-manager/configuration']?.put) throw new Error('Esta versão do VCClient tem uma API incompatível.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    throw new Error('O motor demorou para abrir. Tente novamente ou consulte o log.');
  }
  async _prepare(voice, epoch, tuning) {
    this.notify({ state: 'loading', voice: voice.id, message: `Preparando ${voice.name}…` });
    this.ready = false;
    await this.pendingConversion?.catch(() => {});
    await this.start(epoch); this.assertCurrent(epoch);
    const tuningKey = JSON.stringify({ pitchShift: tuning.pitchShift, indexRatio: tuning.indexRatio });
    const changed = this.voiceId !== voice.id || this.tuningKey !== tuningKey;
    if (changed) {
      const slot = await this.json(`/api/slot-manager/slots/${voice.slot}`);
      await this.json(`/api/slot-manager/slots/${voice.slot}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...slot, chunk_sec: PROFILE.chunkSec, pitch_shift: tuning.pitchShift, index_ratio: tuning.indexRatio, protect_ratio: PROFILE.protectRatio, pitch_estimator: 'rmvpe_onnx' }) }, 90000);
      const conf = await this.json('/api/configuration-manager/configuration');
      await this.json('/api/configuration-manager/configuration', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...conf, voice_changer_input_mode: 'client', current_slot_index: voice.slot, input_sample_rate: 48000, output_sample_rate: 48000, extra_frame_sec: PROFILE.extraFrameSec, noise_gate: PROFILE.noiseGate, crossfade_sec: .05, sola_search_frame_sec: .012, pass_through: false, audio_input_device_index: -1, audio_output_device_index: -1, audio_monitor_device_index: -1, recording_started: false, sio_broadcast: false }) }, 90000);
      // This endpoint constructs the GPU pipeline lazily, including on voice changes.
      const info = await this.json('/api/voice-changer-manager/information', {}, 90000);
      if (info.local_voice_changer_interface_active || info.voice_changer_information?.slot_index !== voice.slot) throw new Error('O motor não está no modo de conversão esperado.');
      if (info.voice_changer_information.chunk_sec !== PROFILE.chunkSec || info.voice_changer_information.pipeline_info?.slot_info?.protect_ratio !== PROFILE.protectRatio) throw new Error('O motor não aplicou os ajustes de fala. Ative o microfone novamente.');
      this.voiceId = voice.id;
      this.tuningKey = tuningKey;
      await this._convert(Float32Array.from({ length: PROFILE.chunkSamples }, (_, i) => .05 * Math.sin(2 * Math.PI * 150 * i / 48000)));
    }
    // Flush previous speech on every activation, before the physical microphone opens.
    for (let i = 0; i < 6; i++) { this.assertCurrent(epoch); await this._convert(new Float32Array(PROFILE.chunkSamples)); }
    this.assertCurrent(epoch); this.ready = true;
    this.notify({ state: 'ready', voice: voice.id, message: `${voice.name} pronto · processamento local` });
  }
  convert(samples, voiceId = this.voiceId) {
    if (!this.ready) return Promise.reject(new Error('Prepare o motor de voz primeiro.'));
    if (voiceId !== this.voiceId) return Promise.reject(new Error('A voz mudou. Ative o microfone novamente.'));
    return this._convert(samples);
  }
  _convert(samples) {
    if (this.busy) return Promise.reject(new Error('Conversão já em andamento.'));
    if (!(samples instanceof Float32Array) || samples.length !== PROFILE.chunkSamples) return Promise.reject(new Error('Bloco de áudio inválido.'));
    this.busy = true;
    const request = (async () => {
      const form = new FormData(); form.append('waveform', new Blob([samples]), 'waveform.bin');
      const began = performance.now();
      const response = await this.request('/api/voice-changer/convert_chunk', { method: 'POST', body: form, headers: { 'x-timestamp': String(Date.now()) } }, 15000);
      if (!response.ok) throw new Error(`Falha na conversão (${response.status}).`);
      const data = await response.arrayBuffer();
      if (data.byteLength % 4 || data.byteLength > 48000 * 4 * 3) throw new Error('Resposta de áudio inválida.');
      const output = new Float32Array(data);
      if (!output.every(Number.isFinite)) throw new Error('O motor retornou áudio inválido.');
      return { samples: output, ms: Math.round(performance.now() - began) };
    })();
    this.pendingConversion = request.finally(() => { this.busy = false; this.pendingConversion = null; });
    return this.pendingConversion;
  }
  stop() {
    this.epoch++; this.ready = false; this.voiceId = null; this.lifetime.abort();
    const child = this.child; this.child = null;
    if (!child?.pid) return this.stopping || Promise.resolve();
    this.stopping = new Promise(resolve => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', resolve); killer.once('exit', resolve);
    });
    return this.stopping;
  }
}
module.exports = { Engine, BASE };
