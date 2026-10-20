const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const sha256 = file => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256'), input = fs.createReadStream(file);
  input.on('data', chunk => hash.update(chunk)); input.on('error', reject); input.on('end', () => resolve(hash.digest('hex')));
});
function safeRelative(name) {
  return typeof name === 'string' && !name.includes('\\') && !name.includes(':') && !name.startsWith('/') &&
    name.split('/').every(p => p && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !/[<>"|?*\x00-\x1f]/.test(p) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) &&
    (/^engine\/(?:main\.exe|web_front\/.+|modules\/.+|licenses\/.+)$/.test(name) || /^engine\/model_dir\/\d+\/[^/]+$/.test(name) || /^drivers\/[^/]+$/.test(name));
}
function validateManifest(manifest) {
  if (manifest?.schema !== 1 || !Array.isArray(manifest.packages) || manifest.packages.length > 50) throw new Error('Catálogo de vozes inválido.');
  const ids = new Set(), names = new Set();
  for (const entry of manifest.packages) {
    let url; try { url = new URL(entry.url); } catch { throw new Error('Origem das vozes inválida.'); }
    if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id) || url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || !/^\/hardboostapp\/voiz\/releases\/download\/[^/]+\/[^/]+\.zip$/.test(url.pathname) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 2 * 1024 ** 3 || !Array.isArray(entry.files) || !entry.files.length || entry.files.length > 10000) throw new Error('Pacote de vozes inválido.');
    ids.add(entry.id);
    let total = 0;
    for (const file of entry.files) {
      if (!safeRelative(file.path) || names.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 512 * 1024 ** 2) throw new Error('Arquivo de voz inválido.');
      names.add(file.path.toLowerCase()); total += file.bytes;
      if (file.inline !== undefined && (typeof file.inline !== 'string' || Buffer.byteLength(file.inline) > 16384 || Buffer.byteLength(file.inline) !== file.bytes || crypto.createHash('sha256').update(file.inline).digest('hex') !== file.sha256)) throw new Error('Configuração de voz inválida.');
    }
    if (total > 3 * 1024 ** 3) throw new Error('Pacote descompactado muito grande.');
  }
  return manifest;
}
class Resources {
  constructor(root, notify = () => {}, manifest = require('./resources.json')) {
    this.root = path.resolve(root); this.notify = notify; this.manifest = validateManifest(manifest);
    this.status = { state: 'idle', message: '', progress: 0 }; this.active = null;
    this.receiptFile = path.join(this.root, 'data/installed-resources.json');
    try { this.receipt = JSON.parse(fs.readFileSync(this.receiptFile, 'utf8')); } catch { this.receipt = {}; }
  }
  snapshot() { return { ...this.status }; }
  emit(value) { Object.assign(this.status, value); this.notify(this.snapshot()); }
  target(relative) {
    if (!safeRelative(relative)) throw new Error('Destino de voz inválido.');
    const target = path.join(this.root, ...relative.split('/'));
    // Do not follow an installed junction into another application.
    let current = this.root;
    for (const part of relative.split('/').slice(0, -1)) { current = path.join(current, part); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('O destino das vozes contém um vínculo. Os arquivos existentes foram preservados.'); }
    return target;
  }
  async matches(file, trustReceipt = false) {
    const target = this.target(file.path);
    try {
      if (fs.lstatSync(target).isSymbolicLink() || fs.statSync(target).size !== file.bytes) return false;
      return trustReceipt || await sha256(target) === file.sha256;
    } catch { return false; }
  }
  async adoptLegacyLinks(entry) {
    for (const folder of ['modules','web_front']) {
      const prefix = `engine/${folder}/`, files = entry.files.filter(file=>file.path.startsWith(prefix));
      const link = path.join(this.root,'engine',folder);
      if (!files.length || !fs.existsSync(link) || !fs.lstatSync(link).isSymbolicLink()) continue;
      const legacy = path.resolve(this.root,'../VCClient-Gratuito/dist',folder);
      if (!fs.existsSync(legacy) || fs.realpathSync.native(link).toLowerCase() !== fs.realpathSync.native(legacy).toLowerCase()) throw new Error('O destino das vozes contém um vínculo desconhecido. Os arquivos existentes foram preservados.');
      // Older local installs shared these two directories. Verify read-only, then
      // replace the junction with owned hard links; keep the original junction as backup.
      for (const file of files) {
        const source = path.join(link,file.path.slice(prefix.length));
        if (!fs.existsSync(source) || fs.statSync(source).size !== file.bytes || await sha256(source) !== file.sha256) throw new Error('As bibliotecas compartilhadas não conferem. Reinstale o Voiz para recuperar os recursos.');
      }
      const updates = path.join(this.root,'updates'); fs.mkdirSync(updates,{recursive:true});
      const stage = fs.mkdtempSync(path.join(updates,'.adopt-'));
      const backup = path.join(updates,'resources-links-previous',crypto.randomUUID(),folder);
      try {
        for (const file of files) {
          const relative = file.path.slice(prefix.length), source = path.join(link,relative), target = path.join(stage,relative);
          fs.mkdirSync(path.dirname(target),{recursive:true});try { fs.linkSync(source,target); } catch { fs.copyFileSync(source,target); }
        }
        fs.mkdirSync(path.dirname(backup),{recursive:true});fs.renameSync(link,backup);
        try { fs.renameSync(stage,link); } catch (error) { fs.renameSync(backup,link);throw error; }
      } finally { if (fs.existsSync(stage)) fs.rmSync(stage,{recursive:true,force:true}); }
    }
  }
  sync() {
    if (this.active) return this.active;
    const work = this.perform().catch(error => { this.emit({ state: 'error', message: 'Não foi possível concluir as vozes: ' + error.message }); throw error; });
    this.active = work;
    work.then(() => { if (this.active === work) this.active = null; }, () => { if (this.active === work) this.active = null; });
    return work;
  }
  async perform() {
    this.emit({ state: 'checking', message: 'Conferindo as vozes do Voiz…', progress: 0 });
    let index = 0;
    for (const entry of this.manifest.packages) {
      await this.adoptLegacyLinks(entry);
      if (entry.id === 'engine') {
        const executable = entry.files.find(file => file.path === 'engine/main.exe');
        const target = executable && this.target(executable.path);
        if (target && !fs.existsSync(target)) {
          const legacy = require('./installation.cjs').engineExecutable(this.root);
          if (legacy !== target && fs.existsSync(legacy) && await sha256(legacy) === executable.sha256) { fs.mkdirSync(path.dirname(target),{recursive:true}); try { fs.linkSync(legacy,target); } catch { fs.copyFileSync(legacy,target); } }
        }
      }
      const trusted = this.receipt[entry.id] === entry.sha256, missing = [];
      for (const file of entry.files) if (!await this.matches(file, trusted)) missing.push(file);
      if (missing.length) {
        this.emit({ state: 'downloading', package: entry.id, message: `Preparando ${entry.name}…`, progress: Math.round(index / this.manifest.packages.length * 100) });
        // Existing installations can reuse verified weights and receive only the small configuration change.
        if (missing.every(file => file.inline !== undefined)) for (const file of missing) this.installBytes(file.path, Buffer.from(file.inline));
        else await this.installPackage(entry);
        for (const file of entry.files) if (!await this.matches(file)) throw new Error(`A integridade de ${entry.name} não confere.`);
      }
      this.receipt[entry.id] = entry.sha256; this.saveReceipt(); index++;
    }
    if (this.manifest.packages.length) {
      for (const directory of ['settings','upload_dir','model_dir','static_model_dir','tmp_dir']) fs.mkdirSync(path.join(this.root,'engine',directory),{recursive:true});
      const configuration = path.join(this.root,'engine/settings/vc_conf.json');
      if (!fs.existsSync(configuration)) fs.copyFileSync(path.join(__dirname,'engine-configuration.json'),configuration);
    }
    this.emit({ state: 'ready', message: 'Vozes prontas. Escolha sua voz e ative o microfone.', progress: 100 });
    return this.snapshot();
  }
  saveReceipt() { fs.mkdirSync(path.dirname(this.receiptFile), { recursive: true }); fs.writeFileSync(this.receiptFile + '.tmp', JSON.stringify(this.receipt)); fs.renameSync(this.receiptFile + '.tmp', this.receiptFile); }
  installBytes(relative, bytes) {
    const target = this.target(relative); fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      const backup = path.join(this.root, 'updates/resources-previous', ...relative.split('/'));
      fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(target, backup);
    }
    const temporary = target + '.voiz-' + crypto.randomUUID(); fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, target);
  }
  async installPackage(entry) {
    const cache = path.join(this.root, 'updates/resource-downloads'); fs.mkdirSync(cache, { recursive: true });
    const archive = path.join(cache, entry.sha256 + '.zip');
    const disk = fs.statfsSync(cache), needed = entry.files.reduce((sum,file)=>sum+file.bytes,0)*2 + (fs.existsSync(archive)?0:entry.bytes) + 100*1024**2;
    if (disk.bavail*disk.bsize < needed) throw new Error(`Libere pelo menos ${Math.ceil(needed/1024**3)} GB para instalar ${entry.name}. Os downloads concluídos serão reaproveitados.`);
    if (!fs.existsSync(archive) || await sha256(archive) !== entry.sha256) {
      const response = await fetch(entry.url, { signal: AbortSignal.timeout(3600000) });
      if (!response.ok || !response.body) throw new Error(`Falha de rede em ${entry.name} (${response.status}). Tente novamente.`);
      let received = 0, previous = 0; const hash = crypto.createHash('sha256');
      const guard = new Transform({ transform: (chunk, _encoding, callback) => {
        received += chunk.length; hash.update(chunk);
        if (received > entry.bytes) return callback(new Error('Download maior que o esperado.'));
        if (Date.now() - previous > 750 || received === entry.bytes) {
          previous = Date.now(); this.emit({ state: 'downloading', package: entry.id, message: `${entry.name}: ${Math.floor(received / 1048576)} / ${Math.ceil(entry.bytes / 1048576)} MB`, progress: Math.floor(received / entry.bytes * 100) });
        }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), guard, fs.createWriteStream(archive + '.part'));
      if (received !== entry.bytes || hash.digest('hex') !== entry.sha256) throw new Error('Download incompleto ou alterado. Tente novamente.');
      fs.renameSync(archive + '.part', archive);
    }
    const stage = fs.mkdtempSync(path.join(cache, '.extract-'));
    try {
      const manifest = path.join(stage, 'package.json'); fs.writeFileSync(manifest, JSON.stringify(entry));
      this.emit({ state: 'installing', message: `Instalando ${entry.name}…` });
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'extract-resources.ps1'), '-Archive', archive, '-Destination', stage, '-Manifest', manifest], { windowsHide: true, maxBuffer: 1024 ** 2, timeout: 600000 });
      for (const file of entry.files) {
        const source = path.join(stage, ...file.path.split('/'));
        if (fs.statSync(source).size !== file.bytes || await sha256(source) !== file.sha256) throw new Error('Arquivo de voz alterado.');
      }
      for (const file of entry.files) {
        const target = this.target(file.path), source = path.join(stage, ...file.path.split('/'));
        if (await this.matches(file)) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (fs.existsSync(target)) {
          const backup = path.join(this.root, 'updates/resources-previous', ...file.path.split('/'));
          fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(target, backup);
        }
        // Rename replaces a hard link without modifying the neighboring source model.
        const temporary = target + '.voiz-' + crypto.randomUUID(); fs.copyFileSync(source, temporary); fs.renameSync(temporary, target);
      }
      fs.unlinkSync(archive);
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
}
module.exports = { Resources, validateManifest, safeRelative, sha256 };
