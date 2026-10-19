const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateBundle } = require('../app/updater.cjs');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'app/package.json'), 'utf8'));
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
if (tag && tag !== `v${pkg.version}`) throw new Error('A tag deve corresponder à versão de app/package.json.');
const files = [];
function visit(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name; const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Vínculo não permitido: ${relative}`);
    if (entry.isDirectory()) visit(full, relative + '/');
    else { const bytes = fs.readFileSync(full); files.push({ path: relative, content: bytes.toString('base64'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }); }
  }
}
visit(path.join(root, 'app'));
const output = Buffer.from(JSON.stringify({ schema: 1, product: 'voiz', version: pkg.version, files }));
validateBundle(output, pkg.version);
const dist = path.join(root, 'release'); fs.mkdirSync(dist, { recursive: true });
const name = `Voiz-${pkg.version}-update.json`; fs.writeFileSync(path.join(dist, name), output);
fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), crypto.createHash('sha256').update(output).digest('hex') + '  ' + name + '\n');
console.log(JSON.stringify({ version: pkg.version, files: files.length, bytes: output.length, artifact: path.join(dist, name) }));
