const PROFILE = Object.freeze({ chunkSamples: 19200, chunkSec: .4, extraFrameSec: .12, noiseGate: -75, protectRatio: .33 });
const DEFAULT_TUNING = Object.freeze({ pitchShift: 0, indexRatio: .65, inputGain: 1 });
function normalizeTuning(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const bounded = (key, min, max) => Number.isFinite(Number(input[key])) ? Math.max(min, Math.min(max, Number(input[key]))) : DEFAULT_TUNING[key];
  return { pitchShift: Math.round(bounded('pitchShift', -12, 12)), indexRatio: bounded('indexRatio', .3, .85), inputGain: bounded('inputGain', .5, 4) };
}
module.exports = { PROFILE, DEFAULT_TUNING, normalizeTuning };
