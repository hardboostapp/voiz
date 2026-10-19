const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const REPOSITORY = 'hardboostapp/voiz';
const MAX_BYTES = 8 * 1024 * 1024;
const REQUIRED = ['package.json', 'main.cjs', 'preload.cjs', 'index.html', 'renderer.js', 'style.css', 'updater.cjs', 'update-install.ps1', 'audio.js', 'audio-worklet.js', 'audio-profile.cjs', 'conversion-queue.mjs', 'engine.cjs', 'library.cjs', 'voices.cjs', 'startup.cjs', 'tray.cjs', 'installation.cjs'];
function versionParts(version) {
  if (typeof version !== 'string' || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)) throw new Error('A versão publicada é inválida.');
  return version.split('.').map(Number);
}
function newer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
function safePath(value) {
  if (typeof value !== 'string' || value.length > 180 || !/^[a-zA-Z0-9_.\/-]+$/.test(value)) return false;
  return value.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}
function validateBundle(bytes, version) {
  if (bytes.length > MAX_BYTES) throw new Error('O pacote excede o limite de tamanho.');
  const bundle = JSON.parse(bytes.toString('utf8'));
  if (bundle.schema !== 1 || bundle.product !== 'voiz' || bundle.version !== version || !Array.isArray(bundle.files) || bundle.files.length > 200) throw new Error('O pacote de atualização é incompatível.');
  versionParts(version);
  const seen = new Set(); let total = 0;
  const files = bundle.files.map(file => {
    if (!safePath(file.path) || seen.has(file.path.toLowerCase()) || !/\.(?:cjs|mjs|js|json|html|css|ico|png|svg|ps1)$/.test(file.path)) throw new Error('O pacote contém um caminho inválido ou duplicado.');
    seen.add(file.path.toLowerCase());
    if (typeof file.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)) throw new Error('Arquivo de atualização inválido.');
    const data = Buffer.from(file.content, 'base64'); total += data.length;
    if (data.toString('base64') !== file.content || total > MAX_BYTES || crypto.createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('A integridade de um arquivo não confere. Baixe a atualização novamente.');
    return { path: file.path, data };
  });
  if (REQUIRED.some(file => !seen.has(file))) throw new Error('O pacote está incompleto.');
  for (const file of files) {
    const parents = file.path.split('/'); parents.pop();
    while (parents.length) { if (seen.has(parents.join('/').toLowerCase())) throw new Error('Há caminhos conflitantes no pacote.'); parents.pop(); }
  }
  const pkg = JSON.parse(files.find(f => f.path === 'package.json').data.toString('utf8'));
  if (pkg.name !== 'voiz' || pkg.version !== version || pkg.main !== 'main.cjs') throw new Error('O pacote não corresponde ao Voiz.');
  return files;
}
async function githubBytes(url, binary = false, maxBytes = MAX_BYTES) {
  let current = new URL(url);
  for (let redirect = 0; redirect < 5; redirect++) {
    if (current.protocol !== 'https:' || current.username || current.password || !['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(current.hostname)) throw new Error('Destino de atualização não autorizado.');
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json', 'User-Agent': 'Voiz-Updater', 'X-GitHub-Api-Version': '2022-11-28' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); await response.body?.cancel(); if (!location) throw new Error('Redirecionamento inválido.'); current = new URL(location, current); continue; }
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(response.status === 404 ? 'Ainda não há uma versão publicada no GitHub.' : response.status === 403 || response.status === 429 ? 'O GitHub limitou as consultas. Tente novamente mais tarde.' : `O GitHub respondeu com erro ${response.status}. Tente novamente.`);
      error.status = response.status; throw error;
    }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('O download excede o limite de tamanho.'); }
    const reader = response.body.getReader(); const parts = []; let length = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) throw new Error('O download excede o limite de tamanho.'); parts.push(Buffer.from(value)); } }
    catch (error) { await reader.cancel().catch(() => {}); throw error; }
    return Buffer.concat(parts);
  }
  throw new Error('O GitHub redirecionou o download muitas vezes.');
}
class Updater {
  constructor(root, currentVersion, notify = () => {}, request = githubBytes) {
    this.root = root; this.currentVersion = currentVersion; this.notify = notify; this.request = request;
    this.state = { status: 'idle', currentVersion, repository: REPOSITORY, message: 'Busque novas versões no GitHub.' };
    this.busy = false; this.release = null; this.stage = null;
  }
  snapshot() { return { ...this.state }; }
  set(status, message, values = {}) { this.state = { currentVersion: this.currentVersion, repository: REPOSITORY, status, message, ...values }; this.notify(this.snapshot()); return this.snapshot(); }
  async check() {
    if (this.busy || this.stage) return this.snapshot();
    this.busy = true; this.release = null; this.set('checking', 'Consultando versões no GitHub…');
    try {
      const release = JSON.parse((await this.request(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, false, 1024 * 1024)).toString('utf8'));
      const version = String(release.tag_name || '').replace(/^v/, '');
      if (release.draft || release.prerelease) throw new Error('A versão publicada ainda não é estável.');
      if (!newer(version, this.currentVersion)) return this.set('current', 'Você está usando a versão mais recente.');
      const asset = release.assets?.find(a => a.name === `Voiz-${version}-update.json` && a.state === 'uploaded');
      if (!asset || !Number.isSafeInteger(asset.id) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_BYTES || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('A versão publicada não tem um pacote válido com verificação de integridade.');
      this.release = { version, id: asset.id, size: asset.size, digest: asset.digest.slice(7) };
      return this.set('available', `Voiz ${version} disponível.`, { version });
    } catch (error) { return this.set(error.status === 404 ? 'unpublished' : 'error', error.status || !['TypeError', 'TimeoutError'].includes(error.name) ? error.message : 'Não foi possível consultar o GitHub. Confira a conexão e tente novamente.'); }
    finally { this.busy = false; }
  }
  async download() {
    if (this.busy || this.stage) return this.snapshot();
    if (!this.release) throw new Error('Busque uma versão antes de baixar.');
    this.busy = true; this.set('downloading', 'Baixando e conferindo a atualização…', { version: this.release.version });
    let stage;
    try {
      const bytes = await this.request(`https://api.github.com/repos/${REPOSITORY}/releases/assets/${this.release.id}`, true);
      if (bytes.length !== this.release.size || crypto.createHash('sha256').update(bytes).digest('hex') !== this.release.digest) throw new Error('A integridade do download não confere. Tente baixar novamente.');
      const files = validateBundle(bytes, this.release.version);
      const updates = path.join(this.root, 'updates'); fs.mkdirSync(updates, { recursive: true });
      if (fs.lstatSync(updates).isSymbolicLink()) throw new Error('A pasta de atualizações precisa ser uma pasta local.');
      stage = path.join(updates, crypto.randomUUID()); fs.mkdirSync(path.join(stage, 'app'), { recursive: true });
      for (const file of files) { const target = path.join(stage, 'app', file.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.data, { flag: 'wx' }); }
      fs.copyFileSync(path.join(__dirname, 'update-install.ps1'), path.join(stage, 'install.ps1'));
      this.stage = stage;
      return this.set('ready', 'Atualização conferida. Reinicie o Voiz para instalar.', { version: this.release.version });
    } catch (error) { if (stage) fs.rmSync(stage, { recursive: true, force: true }); return this.set('error', error.message || 'O download falhou. Tente novamente.'); }
    finally { this.busy = false; }
  }
  launchInstall(pid, executable = process.execPath) {
    if (!this.stage || this.state.status !== 'ready') throw new Error('Baixe a atualização antes de instalar.');
    const literal = value => "'" + value.replace(/'/g, "''") + "'";
    const quoted = value => '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.stage, 'install.ps1'), '-Root', this.root, '-Stage', this.stage, '-ParentId', String(pid), '-Runtime', executable].map(quoted).join(' ');
    // Start-Process creates an independent Windows process that survives Electron exiting.
    // Direct DETACHED_PROCESS causes Windows PowerShell to exit without running its script.
    const command = `$ErrorActionPreference = 'Stop'; Start-Process -FilePath ${literal(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'))} -WindowStyle Hidden -ArgumentList ${literal(args)} -RedirectStandardOutput ${literal(path.join(this.stage, 'installer.log'))} -RedirectStandardError ${literal(path.join(this.stage, 'installer-error.log'))}`;
    const log = fs.openSync(path.join(this.stage, 'launcher.log'), 'a');
    const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    return new Promise((resolve, reject) => {
      let timer; let settled = false;
      const finish = error => { if (settled) return; settled = true; clearInterval(timer); if (error) reject(error); else { helper.unref(); this.set('installing', 'Fechando o Voiz para instalar a atualização…'); resolve(true); } };
      helper.once('error', finish);
      helper.once('exit', code => { if (code !== 0) finish(new Error(`Não foi possível preparar a instalação (${code}). Consulte os logs em updates.`)); });
      helper.once('spawn', () => {
        const deadline = Date.now() + 15000;
        timer = setInterval(() => { if (fs.existsSync(path.join(this.stage, 'installer-ready'))) finish(); else if (Date.now() > deadline) { helper.kill(); finish(new Error('O instalador demorou para abrir. Tente novamente.')); } }, 100);
      });
    });
  }
}
module.exports = { Updater, REPOSITORY, newer, safePath, validateBundle, githubBytes };
