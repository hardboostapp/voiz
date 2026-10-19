const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
module.exports = function fixture(version = '0.5.0') {
  const files = fs.readdirSync(path.join(__dirname, '../app')).filter(name => fs.statSync(path.join(__dirname, '../app', name)).isFile()).map(name => {
    let data = fs.readFileSync(path.join(__dirname, '../app', name)); if (name === 'package.json') data = Buffer.from(JSON.stringify({ ...JSON.parse(data), version }));
    return { path: name, content: data.toString('base64'), sha256: crypto.createHash('sha256').update(data).digest('hex') };
  });
  const bundle = { schema: 1, product: 'voiz', version, files }; const bytes = Buffer.from(JSON.stringify(bundle));
  const release = { tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ id: 123, state: 'uploaded', name: `Voiz-${version}-update.json`, size: bytes.length, digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex') }] };
  return { bundle, bytes, release };
};
