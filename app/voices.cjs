const fs = require('node:fs');
const path = require('node:path');
const VOICES = Object.freeze([
  { id: 'normal', name: 'Natural', kind: 'natural', caption: 'Do seu jeito' },
  { id: 'lula', name: 'Lula', kind: 'rvc', slot: 6, caption: 'Modelo de IA', attribution: 'Ivan198542 · CC BY-NC 4.0 (declarada na origem)' },
  { id: 'bolsonaro', name: 'Bolsonaro', kind: 'rvc', slot: 8, caption: 'Modelo de IA', attribution: 'LH6582 / Ivan198542 · licenças declaradas em models/sources.json' },
  { id: 'mano-brown', name: 'Mano Brown', kind: 'rvc', slot: 10, caption: 'Modelo de IA', attribution: 'vitor007009 · OpenRAIL (declarada no repositório)' },
  { id: 'feminina', name: 'Feminina', kind: 'rvc', slot: 12, caption: 'Modelo de fala', defaultTuning: { pitchShift: 7, indexRatio: .55, inputGain: 1 }, attribution: 'Wismut / RVC_US_Female_1 · Apache-2.0 declarada no repositório; modelo original em inglês' }
]);
function voiceById(id) {
  const voice = VOICES.find(v => v.id === id);
  if (!voice) throw new Error('Voz não reconhecida. Escolha uma opção disponível.');
  return voice;
}
function modelReady(root, voice) {
  if (voice.kind === 'natural') return true;
  try {
    const dir = path.join(root, 'engine/model_dir', String(voice.slot));
    const params = JSON.parse(fs.readFileSync(path.join(dir, 'params.json'), 'utf8'));
    return params.is_onnx === true && path.basename(params.model_file) === params.model_file && fs.existsSync(path.join(dir, params.model_file));
  } catch { return false; }
}
function voiceCatalog(root) { return VOICES.map(v => ({ ...v, available: modelReady(root, v) })); }
module.exports = { VOICES, voiceById, voiceCatalog, modelReady };
