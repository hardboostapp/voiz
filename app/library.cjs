const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { VOICES } = require('./voices.cjs');
const { normalizeTuning } = require('./audio-profile.cjs');
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.opus', '.webm']);
const DEFAULTS = { sounds: [], inputName: '', outputName: '', soundSendEnabled: true, monitorEnabled: true, voiceMonitorEnabled: false, monitorMode: 'windows', monitorName: '', voice: 'normal', micVolume: 1, soundVolume: 0.8, masterVolume: 0.8, stopShortcut: 'CommandOrControl+Shift+Space' };
const clamp = (value, fallback = 1) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
function shortcut(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 70 || !/^(?:(?:CommandOrControl|Ctrl|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Up|Down|Left|Right)$/.test(text)) throw new Error('Use Ctrl, Alt ou Shift com uma letra, número ou F1–F24.');
  return text;
}
class Library {
  constructor(root) {
    this.root = root; this.file = path.join(root, 'library.json');
    fs.mkdirSync(path.join(root, 'sounds'), { recursive: true });
    this.state = structuredClone(DEFAULTS);
    if (fs.existsSync(this.file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.state = { ...this.state, ...saved, monitorMode: saved.monitorMode ?? (saved.monitorName ? 'device' : 'windows') };
      }
      catch { fs.copyFileSync(this.file, `${this.file}.recovery-${Date.now()}`); this.recovered = true; }
    }
    if (!Array.isArray(this.state.sounds)) this.state.sounds = [];
    if (!['windows', 'device'].includes(this.state.monitorMode)) this.state.monitorMode = this.state.monitorName ? 'device' : 'windows';
    this.state.monitorEnabled = typeof this.state.monitorEnabled === 'boolean' ? this.state.monitorEnabled : true;
    this.state.soundSendEnabled = typeof this.state.soundSendEnabled === 'boolean' ? this.state.soundSendEnabled : true;
    this.state.voiceMonitorEnabled = this.state.voiceMonitorEnabled === true;
    this.state.monitorName = String(this.state.monitorName || '').slice(0, 300);
    if (!VOICES.some(v => v.id === this.state.voice)) this.state.voice = 'normal';
    if (this.state.voiceTuningRevision !== 1) {
      let backedUp = false;
      for (const voice of VOICES.filter(v => v.kind === 'rvc')) {
        const saved = this.state.voiceTuning?.[voice.id];
        // Replace only the earlier shipped defaults; keep manual adjustments.
        const earlierDefault = voice.id === 'feminina' ? .55 : .65;
        if (saved?.indexRatio === earlierDefault) {
          if (!backedUp && fs.existsSync(this.file)) { fs.copyFileSync(this.file, `${this.file}.before-clarity-v1`); backedUp = true; }
          saved.indexRatio = .15;
        }
      }
      this.state.voiceTuningRevision = 1;
    }
    this.state.voiceTuning = Object.fromEntries(VOICES.filter(v => v.kind === 'rvc').map(v => [v.id, normalizeTuning({ ...v.defaultTuning, ...this.state.voiceTuning?.[v.id] })]));
    this.state.sounds = this.state.sounds.filter(s => s && /^[a-f0-9-]{36}$/.test(s.id) && AUDIO.has(s.ext));
  }
  save() { fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state, null, 2)); fs.renameSync(`${this.file}.tmp`, this.file); }
  snapshot() { return { ...this.state, sounds: this.state.sounds.map(s => ({ ...s, missing: !fs.existsSync(this.audioPath(s.id)) })), recovered: !!this.recovered }; }
  find(id) { const sound = this.state.sounds.find(s => s.id === id); if (!sound) throw new Error('Som não encontrado.'); return sound; }
  audioPath(id) { const sound = this.find(id); return path.join(this.root, 'sounds', sound.id + sound.ext); }
  import(files) {
    const imported = [], errors = [];
    for (const file of files) {
      try {
        const ext = path.extname(file).toLowerCase();
        if (!AUDIO.has(ext)) throw new Error('Formato não suportado.');
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size > 100 * 1024 * 1024 || !stat.size) throw new Error('Use um arquivo de áudio entre 1 byte e 100 MB.');
        const sound = { id: crypto.randomUUID(), name: path.basename(file, path.extname(file)).slice(0, 80), ext, category: 'Geral', volume: 1, shortcut: '', favorite: false };
        fs.copyFileSync(file, path.join(this.root, 'sounds', sound.id + ext));
        this.state.sounds.push(sound); imported.push(sound.id);
      } catch (error) { errors.push(`${path.basename(file)}: ${error.message}`); }
    }
    this.save(); return { imported, errors, state: this.snapshot() };
  }
  updateSound(id, input) {
    const sound = this.find(id);
    const next = { ...sound, name: String(input.name ?? sound.name).trim().slice(0, 80), category: String(input.category ?? sound.category).trim().slice(0, 30) || 'Geral', volume: clamp(input.volume ?? sound.volume), shortcut: shortcut(input.shortcut ?? sound.shortcut), favorite: Boolean(input.favorite ?? sound.favorite) };
    if (!next.name) throw new Error('Dê um nome ao som.');
    if (next.shortcut && (next.shortcut === this.state.stopShortcut || this.state.sounds.some(s => s.id !== id && s.shortcut === next.shortcut))) throw new Error('Esse atalho já está em uso no Voiz.');
    Object.assign(sound, next); this.save(); return this.snapshot();
  }
  remove(id) { const file = this.audioPath(id); this.state.sounds = this.state.sounds.filter(s => s.id !== id); this.save(); if (fs.existsSync(file)) fs.unlinkSync(file); return this.snapshot(); }
  settings(input) {
    for (const key of ['inputName', 'outputName', 'monitorName']) if (key in input) this.state[key] = String(input[key]).slice(0, 300);
    if (['windows', 'device'].includes(input.monitorMode)) this.state.monitorMode = input.monitorMode;
    else if ('monitorName' in input && !('monitorMode' in input)) this.state.monitorMode = 'device';
    if (typeof input.monitorEnabled === 'boolean') this.state.monitorEnabled = input.monitorEnabled;
    if (typeof input.soundSendEnabled === 'boolean') this.state.soundSendEnabled = input.soundSendEnabled;
    if (typeof input.voiceMonitorEnabled === 'boolean') this.state.voiceMonitorEnabled = input.voiceMonitorEnabled;
    for (const key of ['micVolume', 'soundVolume', 'masterVolume']) if (key in input) this.state[key] = clamp(input[key]);
    if (VOICES.some(v => v.id === input.voice)) this.state.voice = input.voice;
    if (input.voiceTuning && typeof input.voiceTuning === 'object') for (const voice of VOICES.filter(v => v.kind === 'rvc')) {
      if (input.voiceTuning[voice.id]) this.state.voiceTuning[voice.id] = normalizeTuning({ ...this.state.voiceTuning[voice.id], ...input.voiceTuning[voice.id] });
    }
    this.save(); return this.snapshot();
  }
}
module.exports = { Library, DEFAULTS, shortcut, clamp };
