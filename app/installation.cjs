const fs = require('node:fs');
const path = require('node:path');
function firstFile(paths) { return paths.find(file => fs.existsSync(file)) || paths[0]; }
function engineExecutable(root) { return firstFile([path.join(root, 'engine/main.exe'), path.resolve(root, '../VCClient-Gratuito/dist/main.exe')]); }
function driverExecutable(root) { return firstFile([path.join(root, 'drivers/VBCABLE_Setup_x64.exe'), path.resolve(root, '../VCClient-Gratuito/VB-CABLE/VBCABLE_Setup_x64.exe')]); }
module.exports = { engineExecutable, driverExecutable };
