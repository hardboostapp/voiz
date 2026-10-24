import { AudioMixer } from './audio.js';
import { WINDOWS_MONITOR, isMonitorOutput, windowsMonitor } from './monitor-output.mjs';
import { createAutoUpdate } from './auto-update.mjs';
const $ = id => document.getElementById(id);
const api = window.voiz;
let state, voices = [], devices = [], favoriteOnly = false, selected = null, playing = [], busy = false, meterTimer;
let warmingVoice = '', preparedVoice = '', warmGeneration = 0;
let resourcesStatus = { state: 'idle' };
let systemMonitor = { deviceId: '', blocked: false };
let shortcutEditing = null;
const mixer = new AudioMixer(api, onAudio);
for(const id of ['updates-section','app-behavior','call-help','voices-about','open-logs'])$('settings-content').append($(id));
const autoCheckUpdates=createAutoUpdate({snapshot:()=>api.updateState(),check:()=>api.checkUpdate(),render:renderUpdate});
function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; }
function notice(text) { $('notice-text').textContent = text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); $('notice').hidden = false; }
function fail(error) { notice(error.message || String(error)); }
function run(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(fail); }
function outputId() { return $('output-device').value; }
function currentVoice() { return voices.find(v => v.id === state.voice); }
function currentTuning() { return state.voiceTuning?.[state.voice] || { pitchShift: 0, indexRatio: .15, inputGain: 1 }; }
function renderTuning() {
  const tuning = currentTuning(); $('voice-adjustments').hidden = state.voice === 'normal'; $('tuning-title').textContent = `Ajustar ${currentVoice().name}`;
  $('voice-pitch').value = tuning.pitchShift; $('voice-similarity').value = tuning.indexRatio * 100; $('voice-input-gain').value = tuning.inputGain * 100;
  for (const id of ['voice-pitch', 'voice-similarity', 'voice-input-gain']) $(id + '-value').value = `${$(id).value}${id === 'voice-pitch' ? '' : '%'}`;
}
async function saveTuning(tuning) {
  if (mixer.active || mixer.starting) { mixer.stopMic(); notice('Ajuste salvo. Ative o microfone para ouvir a mudança.'); }
  const voice = state.voice; const saved = await api.settings({ voiceTuning: { [voice]: tuning } }); state.voiceTuning = saved.voiceTuning; renderTuning();
  void warmSelectedVoice();
}
function idleVoiceStatus() {
  if (warmingVoice === state.voice) return `Preparando ${currentVoice().name} em segundo plano. O microfone continua desligado.`;
  return preparedVoice === state.voice ? `${currentVoice().name} pronta. Ative o microfone quando quiser falar.` : 'Seu microfone só abre quando você ativar.';
}
async function warmSelectedVoice() {
  const generation = ++warmGeneration, voice = state.voice;
  preparedVoice = ''; warmingVoice = '';
  if (currentVoice().kind === 'natural' || mixer.active || mixer.starting) return;
  warmingVoice = voice; $('voice-status').textContent = idleVoiceStatus();
  try {
    const result = await api.warm(voice, currentTuning());
    if (generation !== warmGeneration || voice !== state.voice) return;
    warmingVoice = ''; if (!result?.skipped) preparedVoice = voice;
    if (!mixer.active && !mixer.starting) $('voice-status').textContent = idleVoiceStatus();
  } catch {
    if (generation !== warmGeneration || voice !== state.voice) return;
    warmingVoice = '';
    if (!mixer.active && !mixer.starting) $('voice-status').textContent = 'A preparação não terminou. Ative o microfone para tentar novamente.';
  }
}
function renderVoices() {
  $('voice-options').replaceChildren();
  for (const voice of voices) {
    const button = document.createElement('button'); button.id = `voice-${voice.id}`; button.className = 'voice-option';
    button.disabled = !voice.available; button.setAttribute('aria-pressed', 'false');
    if (voice.id === 'feminina') button.classList.add('voice-female');
    button.append(icon(voice.kind === 'natural' ? 'mic' : 'wave'));
    const name = document.createElement('strong'); name.textContent = voice.name;
    const caption = document.createElement('span'); caption.textContent = voice.available ? voice.caption : ['checking','downloading','installing'].includes(resourcesStatus.state) ? 'Preparando…' : 'Não instalado';
    button.append(name, caption); button.onclick = run(() => selectVoice(voice.id)); $('voice-options').append(button);
  }
}
async function renderResources(value) {
  resourcesStatus = value;
  $('resources-status').hidden = ['idle','ready'].includes(value.state);
  $('resources-status').textContent = value.message;
  $('resources-retry').hidden = value.state !== 'error';
  if (!state) return;
  if (value.state === 'ready') { voices = (await api.state()).voices; renderVoices(); }
  else for (const voice of voices) {
    const caption = $('voice-' + voice.id)?.querySelector('span');
    if (caption && !voice.available) caption.textContent = ['checking','downloading','installing'].includes(value.state) ? 'Preparando…' : 'Não instalado';
  }
  for (const entry of voices) { const button = $('voice-' + entry.id); button.classList.toggle('selected', entry.id === state.voice); button.setAttribute('aria-pressed', String(entry.id === state.voice)); }
}
function isCableOutput(device) { return device?.kind === 'audiooutput' && /(?:cable input|(?:alto-falantes|speakers).*VB-Audio Virtual Cable)/i.test(device.label); }
function monitorStatus() {
  const target = $('monitor-device').value;
  const followsWindows = target === WINDOWS_MONITOR;
  const sameOutput = !!outputId() && (target === outputId() || (followsWindows && systemMonitor.deviceId === outputId()));
  const blocked = followsWindows && systemMonitor.blocked;
  const defaultHelp = 'Usa a saída padrão do Windows e acompanha suas trocas de fone.';
  const blockedHelp = 'A saída padrão do Windows é virtual. Escolha seu fone no Windows ou nesta lista.';
  $('sound-send-enabled').checked = state.soundSendEnabled;
  $('sound-send-status').textContent = state.soundSendEnabled ? 'Os efeitos também são enviados para a saída da call.' : state.monitorEnabled ? 'Prévia só para você. Os efeitos não são enviados para a call.' : 'Efeitos silenciados na call e no seu fone.';
  $('monitor-enabled').checked = state.monitorEnabled;
  $('monitor-device').disabled = !state.monitorEnabled && !state.voiceMonitorEnabled;
  $('monitor-status').textContent = !state.monitorEnabled ? 'Retorno dos sons desligado.' : blocked ? blockedHelp : sameOutput && state.soundSendEnabled ? 'Você já ouve os sons pela saída principal.' : !target ? 'Escolha seu fone para ouvir os sons por clique ou atalho.' : mixer.monitorError || (followsWindows ? defaultHelp : 'Sons por clique ou atalho também tocam no seu fone.');
  $('voice-monitor-enabled').checked = state.voiceMonitorEnabled;
  $('voice-monitor-status').textContent = !state.voiceMonitorEnabled ? 'Escute a voz escolhida no mesmo fone de “Ouvir em”.' : blocked ? blockedHelp : sameOutput ? 'Sua voz já sai neste fone pela saída principal.' : !target ? 'Escolha seu fone em “Ouvir em”, no Soundboard.' : mixer.monitorError || (mixer.active ? mixer.monitorVoiceSource ? 'Você está ouvindo a voz escolhida no seu fone.' : 'Retorno da voz indisponível. Escolha seu fone em “Ouvir em”.' : 'Ative o microfone para ouvir a voz escolhida no fone.');
}
async function applyMonitor() {
  const target = $('monitor-device').value;
  await mixer.setMonitor({ enabled: state.monitorEnabled, voiceEnabled: state.voiceMonitorEnabled, outputId: target === WINDOWS_MONITOR && systemMonitor.blocked ? '' : target, resolvedOutputId: target === WINDOWS_MONITOR ? systemMonitor.deviceId : '' });
  monitorStatus();
}
async function refreshMonitorDevices() {
  const select = $('monitor-device'), old = select.value;
  const outputs = devices.filter(isMonitorOutput);
  select.replaceChildren(new Option('Escolha seu fone', ''));
  select.add(new Option('Padrão do Windows', WINDOWS_MONITOR));
  for (const device of outputs) select.add(new Option(device.label || `Saída ${select.options.length}`, device.deviceId));
  const found = outputs.find(d => d.label === state.monitorName);
  if (state.monitorMode === 'windows') select.value = WINDOWS_MONITOR;
  else if (found) select.value = found.deviceId;
  await applyMonitor();
  if (old && !select.value && (state.monitorEnabled || state.voiceMonitorEnabled)) notice('Seu dispositivo de retorno foi desconectado. Escolha outro fone em Ouvir em, no Soundboard.');
}
function renderSounds() {
  const focused = document.activeElement;
  const restore = focused?.closest('#sound-grid') ? { id: focused.dataset.sound, action: focused.dataset.action } : null;
  const term = $('search').value.toLocaleLowerCase('pt-BR'); const category = $('category').value;
  const sounds = state.sounds.filter(s => (!favoriteOnly || s.favorite) && (!category || s.category === category) && s.name.toLocaleLowerCase('pt-BR').includes(term));
  $('sound-count').textContent = state.sounds.length ? `${state.sounds.length} ${state.sounds.length === 1 ? 'som na sua coleção' : 'sons na sua coleção'}` : 'Sua coleção de sons para a call.';
  $('empty').hidden = state.sounds.length > 0; $('no-results').hidden = !state.sounds.length || !!sounds.length;
  $('sound-grid').replaceChildren();
  for (const sound of sounds) {
    const card = document.createElement('article'); card.className = `sound-card${playing.includes(sound.id) ? ' is-playing' : ''}`;
    const play = document.createElement('button'); play.className = 'sound-trigger'; play.setAttribute('aria-label', `${playing.includes(sound.id) ? 'Parar' : 'Tocar'} ${sound.name}`); play.disabled = sound.missing;
    play.dataset.sound = sound.id; play.dataset.action = 'play';
    play.append(icon(playing.includes(sound.id) ? 'stop' : 'play'));
    const name = document.createElement('strong'); name.textContent = sound.name; play.append(name);
    const cat = document.createElement('span'); cat.textContent = sound.missing ? 'Arquivo ausente' : sound.category; play.append(cat);
    if (sound.shortcut) { const key = document.createElement('kbd'); key.textContent = sound.shortcut.replace('CommandOrControl', 'Ctrl'); play.append(key); }
    play.onclick = run(() => mixer.play(sound, outputId())); card.append(play);
    const actions = document.createElement('div'); actions.className = 'tile-tools';
    const fav = document.createElement('button'); fav.append(icon('star')); fav.setAttribute('aria-label', `Favoritar ${sound.name}`); fav.setAttribute('aria-pressed', String(sound.favorite)); fav.onclick = run(async () => { state = await api.update(sound.id, { favorite: !sound.favorite }); renderSounds(); });
    fav.dataset.sound = sound.id; fav.dataset.action = 'favorite';
    const edit = document.createElement('button'); edit.append(icon('sliders')); edit.setAttribute('aria-label', `Editar ${sound.name}`); edit.onclick = () => editSound(sound.id);
    edit.dataset.sound = sound.id; edit.dataset.action = 'edit';
    const shortcut = document.createElement('button'); shortcut.append(icon('keyboard')); shortcut.classList.toggle('shortcut-set',!!sound.shortcut); shortcut.setAttribute('aria-label',`${sound.shortcut ? 'Alterar' : 'Adicionar'} atalho de ${sound.name}`); shortcut.title=sound.shortcut ? `Alterar atalho: ${sound.shortcut.replace('CommandOrControl','Ctrl')}` : 'Adicionar atalho'; shortcut.dataset.sound=sound.id;shortcut.dataset.action='shortcut';shortcut.onclick=()=>{shortcutEditing=sound.id;renderSounds();findSoundControl(sound.id,'shortcut-capture')?.focus();};
    actions.append(fav, shortcut, edit); card.append(actions);
    if(shortcutEditing===sound.id)card.append(shortcutEditor(sound));
    $('sound-grid').append(card);
  }
  $('playing-count').textContent = playing.length ? `${playing.length} tocando` : '';
  if (restore) (findSoundControl(restore.id, restore.action) || $('all-tab')).focus({ preventScroll: true });
}
function shortcutFromKey(event) {
  if (['Control','Alt','Shift','Meta'].includes(event.key)) return null;
  const parts=[];if(event.ctrlKey)parts.push('Ctrl');if(event.altKey)parts.push('Alt');if(event.shiftKey)parts.push('Shift');
  const key=event.code==='Space'?'Space':event.code.startsWith('Key')?event.code.slice(3):event.code.startsWith('Digit')?event.code.slice(5):event.key.toUpperCase();
  if(!parts.length||!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space)$/.test(key))throw Error('Combine Ctrl, Alt ou Shift com uma letra, número ou tecla F.');
  return [...parts,key].join('+');
}
function shortcutEditor(sound) {
  const editor=document.createElement('div');editor.className='shortcut-editor';
  const label=document.createElement('label');label.textContent='Atalho deste som';label.htmlFor='quick-shortcut';
  const input=document.createElement('input');input.id='quick-shortcut';input.readOnly=true;input.placeholder='Pressione as teclas';input.dataset.sound=sound.id;input.dataset.action='shortcut-capture';input.setAttribute('aria-describedby','quick-shortcut-help');
  const help=document.createElement('p');help.id='quick-shortcut-help';help.textContent='Ctrl, Alt ou Shift + uma tecla. Salva ao pressionar.';
  const error=document.createElement('p');error.className='shortcut-error';error.setAttribute('role','alert');error.hidden=true;
  const actions=document.createElement('div');actions.className='shortcut-actions';
  const cancel=document.createElement('button');cancel.className='quiet';cancel.textContent='Cancelar';cancel.onclick=()=>finish();actions.append(cancel);
  function finish(){shortcutEditing=null;renderSounds();findSoundControl(sound.id,'shortcut')?.focus();}
  let saving=false;
  async function save(value){if(saving)return;saving=true;input.disabled=true;try{state=await api.update(sound.id,{shortcut:value.replace(/^Ctrl(?=\+)/,'CommandOrControl')});finish();checkShortcuts();}catch(e){error.hidden=false;error.textContent=e.message||String(e);input.disabled=false;input.focus();}finally{saving=false;}}
  input.onkeydown=event=>{
    if(event.key==='Tab')return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='Escape'){finish();return;}
    if(['Backspace','Delete'].includes(event.key)){void save('');return;}
    try{const value=shortcutFromKey(event);if(value)void save(value);}catch(e){error.hidden=false;error.textContent=e.message;}
  };
  if(sound.shortcut){const clear=document.createElement('button');clear.className='quiet';clear.textContent='Remover atalho';clear.onclick=()=>{void save('');};actions.append(clear);}
  editor.append(label,input,help,error,actions);return editor;
}
function findSoundControl(id, action) { return [...$('sound-grid').querySelectorAll('button, input')].find(el => el.dataset.sound === id && el.dataset.action === action); }
function closeEditor() { const id = selected; $('sound-editor').hidden = true; selected = null; (findSoundControl(id, 'edit') || $('all-tab')).focus({ preventScroll: true }); }
function renderCategories() {
  const previous = $('category').value; const categories = [...new Set(state.sounds.map(s => s.category))].sort();
  $('category').replaceChildren(new Option('Todas as categorias', '')); $('categories').replaceChildren();
  for (const c of categories) { $('category').add(new Option(c, c)); const option = document.createElement('option'); option.value = c; $('categories').append(option); }
  if (categories.includes(previous)) $('category').value = previous;
}
function checkShortcuts() { const failed = state.shortcuts?.filter(s => !s.ok); if (failed?.length) notice(`Atalho ocupado por outro aplicativo: ${failed.map(s => s.shortcut.replace('CommandOrControl', 'Ctrl')).join(', ')}. Escolha outro em Editar som.`); }
async function importSounds() { const result = await api.import(); state = { ...result.state, shortcuts: result.shortcuts }; renderCategories(); renderSounds(); checkShortcuts(); if (result.errors.length) notice(result.errors.join(' ')); }
function editSound(id) {
  selected = id; const sound = state.sounds.find(s => s.id === id); $('sound-editor').hidden = false;
  $('edit-name').value = sound.name; $('edit-category').value = sound.category; $('edit-shortcut').value = sound.shortcut.replace('CommandOrControl', 'Ctrl'); $('edit-volume').value = sound.volume * 100; $('editor-error').textContent = ''; $('delete-sound').textContent = 'Remover som'; $('delete-sound').dataset.confirm = ''; $('edit-name').focus(); $('sound-editor').scrollIntoView({ block: 'nearest' });
}
async function refreshDevices() {
  const enumerated = await navigator.mediaDevices.enumerateDevices();
  systemMonitor = windowsMonitor(enumerated);
  devices = enumerated.filter(d => d.deviceId && !['default', 'communications'].includes(d.deviceId));
  const oldInput = $('input-device').value, oldOutput = $('output-device').value;
  for (const [element, kind, stored, old] of [['input-device', 'audioinput', state.inputName, oldInput], ['output-device', 'audiooutput', state.outputName, oldOutput]]) {
    const select = $(element); select.replaceChildren(new Option(kind === 'audioinput' ? 'Escolha seu microfone' : 'Escolha a saída', ''));
    const filtered = devices.filter(d => d.kind === kind);
    for (const d of filtered) select.add(new Option(d.label || `Dispositivo ${select.options.length}`, d.deviceId));
    const found = filtered.find(d => d.label === stored) || filtered.find(d => d.deviceId === old);
    if (found) select.value = found.deviceId;
    else if (kind === 'audioinput') select.value = filtered.find(d => /comica/i.test(d.label))?.deviceId || '';
    else if (!stored) select.value = filtered.find(isCableOutput)?.deviceId || '';
  }
  if ((mixer.active || mixer.starting || playing.length) && ((oldOutput && oldOutput !== outputId()) || (oldInput && oldInput !== $('input-device').value))) { await mixer.resetOutput(); notice('Um dispositivo foi desconectado. O áudio foi parado; confira as seleções.'); }
  $('cable-help').hidden = devices.some(isCableOutput);
  routing();
  await refreshMonitorDevices();
}
function routing() {
  const device = devices.find(d => d.deviceId === outputId()); const cable = isCableOutput(device);
  $('routing-help').textContent = cable ? 'Na sua call, escolha CABLE Output como microfone. Mantenha os fones como saída da call.' : device ? 'Modo de escuta: voz e sons sairão neste dispositivo. Use fones ao ativar o microfone.' : 'Você pode escolher seus fones para testar os sons.';
  $('routing-help').hidden = !device && !$('cable-help').hidden;
  $('output-status').textContent = device ? (cable ? 'Saída para a call' : 'Escuta local') : 'Aguardando saída';
}
function onAudio(event) {
  if (event.playing) { playing = event.playing; renderSounds(); }
  if ('mic' in event) {
    $('mic-badge').textContent = event.mic ? 'Microfone ativo' : 'Microfone desligado'; $('mic-badge').classList.toggle('live', event.mic);
    $('mic-toggle').classList.toggle('live', event.mic); $('mic-toggle').querySelector('span').textContent = event.mic ? 'Desativar microfone' : 'Ativar microfone';
    $('voice-status').textContent = event.mic ? (state.voice !== 'normal' ? `${currentVoice().name} ativo. Sua fala está sendo transformada.` : 'Sua voz natural está na mistura.') : idleVoiceStatus();
    if (!event.mic) { busy = false; $('latency').textContent = 'Local'; $('input-level').textContent = 'O nível aparece ao ativar o microfone.'; }
    monitorStatus();
  }
  if (event.ms) $('latency').textContent = `${event.ms} ms / bloco`;
  if ('buffering' in event) $('voice-status').textContent = event.buffering ? 'Aguardando a conversão para retomar a fala. Se repetir, reduza a carga de outros aplicativos.' : `${currentVoice().name} ativo. Sua fala está sendo transformada.`;
  if (Number.isFinite(event.inputDb)) $('input-level').textContent = event.inputPeak >= .98 ? 'Entrada saturando: reduza o ganho ou afaste o microfone.' : `Entrada: ${Math.round(event.inputDb)} dB. Fala muito baixa? Aproxime o microfone ou aumente o ganho.`;
  if (event.error) fail(event.error);
  if (event.monitorError) { monitorStatus(); notice(event.monitorError); }
}
async function selectVoice(voice) {
  const choice = voices.find(v => v.id === voice);
  if (!choice?.available) throw new Error('Esta voz não está instalada. Escolha uma das vozes disponíveis.');
  if (state.voice === voice && $('voice-' + voice).getAttribute('aria-pressed') === 'true') return;
  if (mixer.active || mixer.starting) { mixer.stopMic(); notice('Voz trocada. Ative o microfone para usar a nova voz.'); }
  state.voice = voice;
  ++warmGeneration; warmingVoice = ''; preparedVoice = '';
  for (const entry of voices) { const button = $('voice-' + entry.id); button.classList.toggle('selected', entry.id === voice); button.setAttribute('aria-pressed', String(entry.id === voice)); }
  $('model-info').hidden = choice.kind === 'natural'; $('model-info-text').textContent = `${choice.name} · conversão local`;
  renderTuning();
  $('voice-status').textContent = idleVoiceStatus();
  await api.settings({ voice });
  if (state.voice === voice) void warmSelectedVoice();
}
function stopAll() { mixer.stopAll(); busy = false; $('mic-toggle').querySelector('span').textContent = 'Ativar microfone'; }
function renderStartup(value) {
  $('start-with-windows').checked = value.enabled; $('start-with-windows').disabled = !value.supported;
  $('startup-status').textContent = value.enabled ? 'Ao entrar no Windows, o Voiz inicia na bandeja com o microfone desligado.' : value.registered ? 'O Windows desativou a inicialização do Voiz. Você pode habilitá-la aqui.' : 'O Voiz só inicia quando você abrir. O microfone começa desligado.';
}
$('start-with-windows').onchange = run(async () => {
  const enabled = $('start-with-windows').checked; $('start-with-windows').disabled = true;
  try { renderStartup(await api.setStartup(enabled)); }
  catch (error) { renderStartup(await api.startupState()); throw error; }
});
function renderUpdate(update) {
  $('update-version').textContent = `Versão instalada: ${update.currentVersion}`;
  $('update-status').textContent = update.message;
  const working = ['checking', 'downloading', 'installing'].includes(update.status);
  $('update-check').disabled = working;
  $('update-check').hidden = ['available', 'ready', 'installing'].includes(update.status);
  $('update-check').textContent = update.status === 'checking' ? 'Buscando…' : 'Buscar atualização';
  $('update-download').hidden = update.status !== 'available';
  $('update-download').textContent = `Baixar Voiz ${update.version || ''}`;
  $('update-install').hidden = !['ready', 'installing'].includes(update.status);
  $('update-install').disabled = update.status === 'installing';
  const available=['available','ready'].includes(update.status);
  $('settings-update-dot').hidden=!available;
  $('open-settings').setAttribute('aria-label',available?'Configurações: atualização disponível':'Configurações');
  $('open-settings').title=available?'Configurações: atualização disponível':'Configurações';
  $('updates-section').querySelector('summary').textContent=available?'Atualizações · versão nova disponível':'Atualizações do Voiz';
}
$('open-settings').onclick=()=>{$('settings-dialog').showModal();if(!$('settings-update-dot').hidden)$('updates-section').open=true;};
$('close-settings').onclick=()=>{$('settings-dialog').close();};
$('settings-dialog').addEventListener('close',()=>{$('open-settings').focus();});
api.onCheckUpdates(()=>{void autoCheckUpdates();});
$('update-check').onclick = run(async () => renderUpdate(await api.checkUpdate()));
$('update-download').onclick = run(async () => renderUpdate(await api.downloadUpdate()));
$('update-install').onclick = run(async () => { stopAll(); await api.installUpdate(); });
$('update-repository').onclick = run(() => api.updateRepository());
api.onUpdate(renderUpdate);
$('mic-toggle').onclick = run(async () => {
  if (mixer.active || mixer.starting || busy) { mixer.stopMic(); busy = false; return; }
  if (!outputId()) throw new Error('Escolha a saída antes de ativar o microfone.');
  if (!$('input-device').value) throw new Error('Selecione o microfone de entrada.');
  const input = devices.find(d => d.deviceId === $('input-device').value);
  const output = devices.find(d => d.deviceId === outputId());
  if (isCableOutput(output) && /VB-Audio Virtual Cable/i.test(input?.label || '')) throw new Error('Selecione seu microfone físico, como o Comica. Usar o cabo como entrada e saída cria realimentação.');
  busy = true; $('mic-toggle').querySelector('span').textContent = 'Cancelar ativação'; $('voice-status').textContent = state.voice !== 'normal' ? `Preparando ${currentVoice().name}. A primeira abertura pode levar alguns minutos.` : 'Abrindo microfone…';
  const pending = mixer.startMic($('input-device').value, outputId(), state.voice, state.voice === 'normal' ? {} : currentTuning()); const attempt = mixer.generation;
  try { await pending; }
  finally { if (attempt === mixer.generation) { busy = false; if (!mixer.active) onAudio({ mic: false }); } }
});
$('import').onclick = run(importSounds); $('import-empty').onclick = run(importSounds);
$('stop-all').onclick = stopAll; $('stop-sounds').onclick = () => mixer.stopSounds();
$('search').oninput = renderSounds; $('category').onchange = renderSounds;
for (const id of ['all-tab', 'favorites-tab']) $(id).onclick = () => { favoriteOnly = id === 'favorites-tab'; for (const tab of ['all-tab', 'favorites-tab']) { $(tab).classList.toggle('selected', tab === id); $(tab).setAttribute('aria-pressed', String(tab === id)); } renderSounds(); };
$('refresh-devices').onclick = run(refreshDevices);
for (const [id, key, scale] of [['voice-pitch', 'pitchShift', 1], ['voice-similarity', 'indexRatio', 100], ['voice-input-gain', 'inputGain', 100]]) {
  $(id).oninput = () => { $(id + '-value').value = `${$(id).value}${scale === 1 ? '' : '%'}`; };
  $(id).onchange = run(() => saveTuning({ ...currentTuning(), [key]: Number($(id).value) / scale }));
}
$('reset-voice-tuning').onclick = run(() => saveTuning(currentVoice().defaultTuning || { pitchShift: 0, indexRatio: .15, inputGain: 1 }));
for (const id of ['input-device', 'output-device']) $(id).onchange = run(async () => {
  if (id === 'output-device') await mixer.resetOutput(); else mixer.stopMic();
  const key = id === 'input-device' ? 'inputName' : 'outputName'; const label = devices.find(d => d.deviceId === $(id).value)?.label || '';
  state[key] = label; await api.settings({ [key]: label }); routing(); await applyMonitor();
});
$('monitor-enabled').onchange = run(async () => { state.monitorEnabled = $('monitor-enabled').checked; await api.settings({ monitorEnabled: state.monitorEnabled }); await applyMonitor(); });
$('sound-send-enabled').onchange = run(async () => { const control=$('sound-send-enabled'),enabled=control.checked;control.disabled=true;try{if(!enabled)await mixer.setSoundSend(false);const saved=await api.settings({soundSendEnabled:enabled});state.soundSendEnabled=saved.soundSendEnabled;if(enabled)await mixer.setSoundSend(true);}finally{control.disabled=false;monitorStatus();} });
$('voice-monitor-enabled').onchange = run(async () => { state.voiceMonitorEnabled = $('voice-monitor-enabled').checked; await api.settings({ voiceMonitorEnabled: state.voiceMonitorEnabled }); await applyMonitor(); });
$('monitor-device').onchange = run(async () => { state.monitorMode = $('monitor-device').value === WINDOWS_MONITOR ? 'windows' : 'device'; state.monitorName = devices.find(d => d.deviceId === $('monitor-device').value)?.label || ''; await api.settings({ monitorMode: state.monitorMode, monitorName: state.monitorName }); await applyMonitor(); });
for (const [id, key] of [['mic-volume', 'micVolume'], ['sound-volume', 'soundVolume'], ['master-volume', 'masterVolume']]) {
  $(id).oninput = () => { state[key] = Number($(id).value) / 100; $(id + '-value').value = `${$(id).value}%`; mixer.setVolumes({ [key]: state[key] }); };
  $(id).onchange = run(() => api.settings({ [key]: state[key] }));
}
$('edit-shortcut').onkeydown = event => {
  if (event.key === 'Tab') return; event.preventDefault(); if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
  if (['Backspace', 'Delete', 'Escape'].includes(event.key)) { $('edit-shortcut').value = ''; return; }
  const parts = []; if (event.ctrlKey) parts.push('Ctrl'); if (event.altKey) parts.push('Alt'); if (event.shiftKey) parts.push('Shift');
  const key = event.code === 'Space' ? 'Space' : event.code.startsWith('Key') ? event.code.slice(3) : event.code.startsWith('Digit') ? event.code.slice(5) : event.key.toUpperCase();
  if (!parts.length || !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space)$/.test(key)) { $('editor-error').textContent = 'Combine Ctrl, Alt ou Shift com uma letra, número ou tecla F.'; return; }
  $('edit-shortcut').value = [...parts, key].join('+'); $('editor-error').textContent = '';
};
$('clear-shortcut').onclick = () => { $('edit-shortcut').value = ''; };
$('close-editor').onclick = closeEditor;
$('sound-editor').onsubmit = async event => { event.preventDefault(); try { state = await api.update(selected, { name: $('edit-name').value, category: $('edit-category').value, volume: Number($('edit-volume').value) / 100, shortcut: $('edit-shortcut').value.replace(/^Ctrl(?=\+)/, 'CommandOrControl') }); renderCategories(); renderSounds(); checkShortcuts(); closeEditor(); } catch (error) { $('editor-error').textContent = error.message; } };
$('delete-sound').onclick = run(async () => { if (!$('delete-sound').dataset.confirm) { $('delete-sound').dataset.confirm = 'yes'; $('delete-sound').textContent = 'Confirmar remoção'; return; } mixer.stopSounds(); mixer.cache.delete(selected); state = await api.remove(selected); $('sound-editor').hidden = true; selected = null; renderCategories(); renderSounds(); });
$('install-driver').onclick = run(async () => {
  $('install-driver').disabled=true;
  try { const result = await api.driver(); notice(result?.downloadPage ? 'A instalação do Voiz precisa ser concluída. Baixe o instalador mais recente em Atualizações para receber o cabo e as vozes.' : result.message); await refreshDevices(); }
  finally { $('install-driver').disabled=false; }
});
$('cable-site').onclick = run(() => api.cableSite());
$('cable-support').onclick = run(() => api.cableSite());
$('resources-retry').onclick = run(async () => { stopAll(); await api.syncResources(); });
api.onResources(value => { void renderResources(value).catch(fail); });
$('open-logs').onclick = run(() => api.logs()); $('dismiss-notice').onclick = () => { $('notice').hidden = true; };
api.onShortcut(run(async id => { if (id === 'stop') return stopAll(); if (document.activeElement === $('edit-shortcut') || shortcutEditing) return; const sound = state.sounds.find(s => s.id === id); if (sound) await mixer.play(sound, outputId()); }));
api.onEngine(event => { if (mixer.starting && event.voice === state.voice) $('voice-status').textContent = event.state === 'loading' ? `${event.message} A primeira abertura pode levar alguns minutos.` : event.message; if (event.state === 'offline') { preparedVoice = ''; if (state.voice !== 'normal' && mixer.active) { mixer.stopMic(); notice('O motor de voz encerrou. Ative o microfone para tentar novamente.'); } else if (!mixer.starting && !warmingVoice) $('voice-status').textContent = idleVoiceStatus(); } });
navigator.mediaDevices.addEventListener('devicechange', run(refreshDevices));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.activeElement !== $('edit-shortcut') && !$('settings-dialog').open) stopAll(); });
window.addEventListener('beforeunload', () => { clearInterval(meterTimer); mixer.stopAll(); });
async function init() {
  state = await api.state(); voices = state.voices; renderVoices(); mixer.setVolumes(state);
  await mixer.setSoundSend(state.soundSendEnabled);
  renderUpdate(await api.updateState());
  renderStartup(await api.startupState());
  if (!currentVoice()?.available) { state.voice = 'normal'; notice('A voz salva não está disponível. Sua voz natural foi selecionada.'); }
  for (const [id, key] of [['mic-volume', 'micVolume'], ['sound-volume', 'soundVolume'], ['master-volume', 'masterVolume']]) { $(id).value = state[key] * 100; $(id + '-value').value = `${Math.round(state[key] * 100)}%`; }
  await selectVoice(state.voice); renderCategories(); renderSounds(); checkShortcuts(); await refreshDevices();
  await renderResources(await api.resourcesState());
  if (state.recovered) notice('A biblioteca tinha um erro. Uma cópia foi preservada em data para recuperação.');
  void autoCheckUpdates();
  meterTimer = setInterval(() => { const level = Math.round(mixer.level() * 100); $('meter-fill').style.transform = `scaleX(${level / 100})`; $('meter-fill').parentElement.setAttribute('aria-valuenow', String(level)); }, 80);
}
init().catch(fail);
