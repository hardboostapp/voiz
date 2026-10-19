const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Updater, newer, safePath, validateBundle } = require('../app/updater.cjs');
function fixture(version = '0.5.0') {
  const files = fs.readdirSync(path.join(__dirname, '../app')).filter(name => fs.statSync(path.join(__dirname, '../app', name)).isFile()).map(name => {
    let data = fs.readFileSync(path.join(__dirname, '../app', name));
    if (name === 'package.json') data = Buffer.from(JSON.stringify({ ...JSON.parse(data), version }));
    return { path: name, content: data.toString('base64'), sha256: crypto.createHash('sha256').update(data).digest('hex') };
  });
  const bundle = { schema: 1, product: 'voiz', version, files }; const bytes = Buffer.from(JSON.stringify(bundle));
  const release = { tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ id: 123, state: 'uploaded', name: `Voiz-${version}-update.json`, size: bytes.length, digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex') }] };
  return { bundle, bytes, release };
}
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voiz-update-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
test('Compara versões e bloqueia caminhos perigosos no Windows', () => {
  assert.equal(newer('0.10.0', '0.9.9'), true); assert.equal(newer('0.4.0', '0.4.0'), false);
  assert.equal(newer('0.3.9', '0.4.0'), false); assert.throws(() => newer('0.5.0-beta', '0.4.0'));
  for (const name of ['../data/library.json', '/main.cjs', 'a//b.js', 'C:/x.js', 'a\\b.js', 'CON.js', 'a/../b.js', 'file.js.']) assert.equal(safePath(name), false, name);
});
test('Rejeita pacote alterado, incompleto e caminhos duplicados', () => {
  const { bundle, bytes } = fixture(); assert.ok(validateBundle(bytes, '0.5.0').length > 10);
  const altered = structuredClone(bundle); altered.files[0].content = Buffer.from('tampered').toString('base64');
  assert.throws(() => validateBundle(Buffer.from(JSON.stringify(altered)), '0.5.0'), /integridade/);
  const duplicate = structuredClone(bundle); duplicate.files.push({ ...duplicate.files[0], path: duplicate.files[0].path.toUpperCase() });
  assert.throws(() => validateBundle(Buffer.from(JSON.stringify(duplicate)), '0.5.0'));
  const missing = structuredClone(bundle); missing.files = [];
  assert.throws(() => validateBundle(Buffer.from(JSON.stringify(missing)), '0.5.0'), /incompleto/);
});
test('Consulta, baixa e prepara sem tocar na biblioteca ou no aplicativo em uso', async t => {
  const root = temporary(t), { bytes, release } = fixture();
  fs.mkdirSync(path.join(root, 'data')); fs.writeFileSync(path.join(root, 'data/library.json'), 'personal');
  fs.mkdirSync(path.join(root, 'app')); fs.writeFileSync(path.join(root, 'app/keep.txt'), 'current');
  const updates = []; let calls = 0;
  const updater = new Updater(root, '0.4.0', state => updates.push(state.status), async (url, binary) => { calls++; return binary ? bytes : Buffer.from(JSON.stringify(release)); });
  assert.equal((await updater.check()).status, 'available');
  assert.equal((await updater.download()).status, 'ready');
  assert.equal((await updater.download()).status, 'ready'); assert.equal(calls, 2);
  assert.equal(fs.readFileSync(path.join(root, 'data/library.json'), 'utf8'), 'personal');
  assert.equal(fs.readFileSync(path.join(root, 'app/keep.txt'), 'utf8'), 'current');
  assert.equal(JSON.parse(fs.readFileSync(path.join(updater.stage, 'app/package.json'))).version, '0.5.0');
  assert.deepEqual(updates, ['checking', 'available', 'downloading', 'ready']);
});
test('Download adulterado mantém aplicativo e dados intactos', async t => {
  const root = temporary(t), { release } = fixture();
  const updater = new Updater(root, '0.4.0', () => {}, async (_url, binary) => binary ? Buffer.from('wrong') : Buffer.from(JSON.stringify(release)));
  await updater.check(); assert.equal((await updater.download()).status, 'error');
  assert.equal(fs.existsSync(path.join(root, 'updates')), false); assert.equal(updater.stage, null);
});
test('Sem release, falha de rede e versão atual permitem nova consulta', async t => {
  const root = temporary(t); let mode = 'missing';
  const updater = new Updater(root, '0.4.0', () => {}, async () => {
    if (mode === 'missing') throw Object.assign(new Error('Ainda não há uma versão publicada no GitHub.'), { status: 404 });
    if (mode === 'network') throw new TypeError('fetch failed');
    return Buffer.from(JSON.stringify(fixture('0.4.0').release));
  });
  assert.equal((await updater.check()).status, 'unpublished'); mode = 'network'; assert.equal((await updater.check()).status, 'error');
  mode = 'current'; assert.equal((await updater.check()).status, 'current');
});
test('Instalador troca somente app, preserva os dados e mantém backup', { skip: process.platform !== 'win32' }, async t => {
  const root = temporary(t), { bytes, release } = fixture();
  fs.mkdirSync(path.join(root, 'app')); fs.writeFileSync(path.join(root, 'app/package.json'), JSON.stringify({ name: 'voiz', main: 'main.cjs', version: '0.4.0' }));
  fs.writeFileSync(path.join(root, 'app/main.cjs'), '// previous');
  for (const folder of ['data', 'models', 'engine', 'electron-profile']) { fs.mkdirSync(path.join(root, folder)); fs.writeFileSync(path.join(root, folder, 'keep.txt'), folder); }
  const updater = new Updater(root, '0.4.0', () => {}, async (_url, binary) => binary ? bytes : Buffer.from(JSON.stringify(release)));
  await updater.check(); await updater.download();
  const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(updater.stage, 'install.ps1'), '-Root', root, '-Stage', updater.stage, '-ParentId', '0', '-Runtime', process.execPath, '-NoRelaunch'], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'app/package.json'))).version, '0.5.0');
  assert.equal(fs.readFileSync(path.join(updater.stage, 'previous-app/main.cjs'), 'utf8'), '// previous');
  for (const folder of ['data', 'models', 'engine', 'electron-profile']) assert.equal(fs.readFileSync(path.join(root, folder, 'keep.txt'), 'utf8'), folder);
  const result = JSON.parse(fs.readFileSync(path.join(root, 'updates/last-result.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(result.installed, true);
});
