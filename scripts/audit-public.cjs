const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const patterns = [
  ['credential-format', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/],
  ['literal-secret', /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|senha)\s*[:=]\s*['"][^'"]{12,}['"]/i],
  ['personal-profile-path', /C:[\\/]+Users[\\/]+[A-Za-z0-9_~ ]+[\\/]/i],
  ['personal-email', /[a-z0-9._%+-]+@(?:gmail|hotmail|outlook)\.com/i]
];
const findings = [];
for (const file of files) {
  if (/^(?:data|models|engine|logs|electron-profile|previews|release|tests\/fixtures)\//.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file)) findings.push({ file, type: 'private-file' });
  if (/\.(png|ico)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [type, pattern] of patterns) if (pattern.test(text)) findings.push({ file, type });
}
const report = { passed: findings.length === 0, date: new Date().toISOString(), files: files.length, findings, scope: 'Tracked Voiz files only. Pattern scan and explicit publishing allowlist; not an audit of the PC or a guarantee against every possible secret.' };
fs.writeFileSync(path.join(root, 'docs/public-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); if (findings.length) process.exitCode = 1;
