const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const ENGINE_SHA256 = '903a21774805c67be52cf9b43eb80cd8515a8183272885b33ba8882ea8705800';
const MAGIC = Buffer.from([77, 69, 73, 12, 11, 10, 11, 14]);
const PATCH_VERSION = 1;
function entries(bytes) {
  const cookie = bytes.lastIndexOf(MAGIC);
  if (cookie < 0 || cookie + 88 > bytes.length) throw new Error('Pacote do motor inválido.');
  const start = cookie + 88 - bytes.readUInt32BE(cookie + 8);
  const table = start + bytes.readUInt32BE(cookie + 12), length = bytes.readUInt32BE(cookie + 16);
  if (start < 0 || table < start || table + length > cookie || bytes.readUInt32BE(cookie + 20) !== 310) throw new Error('Formato do motor incompatível.');
  const result = []; let total = 0;
  for (let offset = table; offset < table + length;) {
    const size = bytes.readUInt32BE(offset);
    if (size < 19 || offset + size > table + length) throw new Error('Índice do motor inválido.');
    const type = String.fromCharCode(bytes[offset + 17]);
    if (['b', 'x', 'Z'].includes(type)) {
      const name = bytes.subarray(offset + 18, offset + size).toString('utf8').split('\0')[0].replaceAll('\\', '/');
      if (!name || name.includes(':') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p))) throw new Error('Caminho inválido no motor.');
      const position = start + bytes.readUInt32BE(offset + 4), packed = bytes.readUInt32BE(offset + 8), unpacked = bytes.readUInt32BE(offset + 12);
      total += unpacked;
      if (position < start || position + packed > table || unpacked > 512 * 1024 ** 2 || total > 2 * 1024 ** 3 || result.length > 20000) throw new Error('Tamanho inválido no motor.');
      result.push({ name, position, packed, unpacked, compressed: bytes[offset + 16] === 1 });
    } else if (type === 'n' || type === 'd') throw new Error('O motor contém dependências não suportadas.');
    offset += size;
  }
  if (new Set(result.map(e => e.name.toLowerCase())).size !== result.length) throw new Error('Arquivos duplicados no motor.');
  return result;
}
function prepareRuntime(executable, root, notify = () => {}, expectedHash = ENGINE_SHA256) {
  const exe = fs.realpathSync.native(executable), bytes = fs.readFileSync(exe);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error('A versão do motor não confere. Reinstale o Voiz para recuperar o motor.');
  const parent = path.join(root, 'engine-runtime'), destination = path.join(parent, hash);
  fs.mkdirSync(parent, { recursive: true });
  if (fs.lstatSync(parent).isSymbolicLink()) throw new Error('Pasta de runtime inesperada.');
  const marker = path.join(destination, 'voiz-runtime.json');
  let ready = false;
  try {
    const receipt = JSON.parse(fs.readFileSync(marker, 'utf8'));
    ready = receipt.sha256 === hash && receipt.patch === PATCH_VERSION && receipt.files.every(e => fs.statSync(path.join(destination, e.name)).size === e.size);
  } catch {}
  if (!ready) {
    if (fs.existsSync(destination)) throw new Error('O runtime do motor está incompleto. Reinstale o Voiz para recuperá-lo.');
    notify({ state: 'loading', message: 'Preparando as bibliotecas do motor. Esta etapa só ocorre uma vez…' });
    const content = entries(bytes), stage = fs.mkdtempSync(path.join(parent, '.build-')), files = [];
    try {
      for (const entry of content) {
        const target = path.join(stage, ...entry.name.split('/'));
        if (!target.startsWith(stage + path.sep)) throw new Error('Destino inválido do runtime.');
        const source = bytes.subarray(entry.position, entry.position + entry.packed);
        let data = entry.compressed ? zlib.inflateSync(source, { maxOutputLength: Math.max(1, entry.unpacked) }) : source;
        if (data.length !== entry.unpacked) throw new Error('Biblioteca do motor incompleta.');
        if (entry.name === 'native_client/resources/app/main.js') {
          const firstLine = 'const { app, Menu, BrowserWindow, ipcMain } = require("electron");';
          const script = data.toString('utf8');
          if (!script.startsWith(firstLine)) throw new Error('Cliente do motor incompatível.');
          // The pinned VCClient launches its demo client even with launch_client=False.
          // Keep that client alive without creating windows or loading its audio UI.
          data = Buffer.from(firstLine + '\nif (process.env.VOIZ_HEADLESS === "1") { app.whenReady().then(() => {}); } else {\n' + script.slice(firstLine.length) + '\n}\n');
        }
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data);
        files.push({ name: entry.name, size: data.length });
      }
      fs.writeFileSync(path.join(stage, 'voiz-runtime.json'), JSON.stringify({ sha256: hash, patch: PATCH_VERSION, files }));
      fs.renameSync(stage, destination);
    } catch (error) { fs.rmSync(stage, { recursive: true, force: true }); throw error; }
  }
  const env = { ...process.env, _PYI_ARCHIVE_FILE: exe, _PYI_APPLICATION_HOME_DIR: destination, _PYI_PARENT_PROCESS_LEVEL: '0', VOIZ_HEADLESS: '1' };
  delete env.PYINSTALLER_RESET_ENVIRONMENT;
  return { executable: exe, directory: destination, env };
}
module.exports = { prepareRuntime, entries, ENGINE_SHA256 };
