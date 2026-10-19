const { app, BrowserWindow, ipcMain, dialog, globalShortcut, session, shell, Tray, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { spawn } = require('node:child_process');
const { Library } = require('./library.cjs');
const { Engine } = require('./engine.cjs');
const { voiceCatalog } = require('./voices.cjs');
const { Updater, REPOSITORY } = require('./updater.cjs');
const { createStartup } = require('./startup.cjs');
const { createTray, closeToTray } = require('./tray.cjs');
const { version } = require('./package.json');
const root = path.resolve(__dirname, '..');
const testRoot = process.env.VOIZ_TEST_DATA;
app.setPath('userData', path.join(testRoot || root, 'electron-profile'));
app.setName('Voiz');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
let window, library, engine, updater, tray, startup, installingUpdate = false, micArmedUntil = 0, registrations = [], quitting = false, exitRequested = false;
const startInTray = process.argv.includes('--voiz-background');
const pageFile = fs.realpathSync.native(path.join(__dirname, 'index.html'));
function isAppPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'file:' && !url.host && !url.search && !url.hash && fs.realpathSync.native(fileURLToPath(url)).toLowerCase() === pageFile.toLowerCase();
  } catch { return false; }
}
function send(channel, value) { if (window && !window.isDestroyed()) window.webContents.send(channel, value); }
function showWindow() { if (!window || window.isDestroyed()) return; if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
function registerShortcuts() {
  globalShortcut.unregisterAll(); registrations = [];
  const entries = [{ id: 'stop', name: 'Parar tudo', shortcut: library.state.stopShortcut }, ...library.state.sounds];
  if (testRoot || process.env.VOIZ_TEST_HIDE) { registrations = entries.filter(s => s.shortcut).map(s => ({ id: s.id, shortcut: s.shortcut, ok: true })); return registrations; }
  for (const item of entries.filter(s => s.shortcut)) {
    let ok = false;
    try { ok = globalShortcut.register(item.shortcut, () => send('shortcut', item.id)); } catch {}
    registrations.push({ id: item.id, shortcut: item.shortcut, ok });
  }
  return registrations;
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !isAppPage(event.senderFrame.url)) throw new Error('Origem não autorizada.');
    return fn(...args);
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => { if (!argv.includes('--voiz-background')) showWindow(); });
  app.whenReady().then(() => {
    library = new Library(testRoot || path.join(root, 'data'));
    engine = new Engine(root, value => send('engine-status', value));
    updater = new Updater(testRoot || root, version, value => send('update-status', value));
    startup = createStartup(app, process.execPath, __dirname, !!testRoot);
    session.defaultSession.setPermissionCheckHandler((wc, permission) => wc === window?.webContents && ['media', 'speaker-selection'].includes(permission));
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      const local = wc === window?.webContents;
      const audioOnly = !details.mediaTypes?.includes('video');
      callback(local && ((permission === 'media' && audioOnly && Date.now() < micArmedUntil) || permission === 'speaker-selection'));
    });
    handle('state', () => ({ ...library.snapshot(), shortcuts: registrations, voices: voiceCatalog(root) }));
    handle('import', async () => {
      const selection = await dialog.showOpenDialog(window, { title: 'Adicionar sons ao Voiz', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Áudio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'webm'] }] });
      const result = library.import(selection.canceled ? [] : selection.filePaths); registerShortcuts();
      return { ...result, shortcuts: registrations };
    });
    handle('sound-update', (id, input) => { const result = library.updateSound(id, input); registerShortcuts(); return { ...result, shortcuts: registrations }; });
    handle('sound-remove', id => { const result = library.remove(id); registerShortcuts(); return { ...result, shortcuts: registrations }; });
    handle('sound-bytes', id => { const file = library.audioPath(id); if (fs.statSync(file).size > 100 * 1024 * 1024) throw new Error('Arquivo muito grande.'); return fs.readFileSync(file); });
    handle('settings', input => library.settings(input));
    handle('startup-state', () => startup.snapshot());
    handle('startup-set', enabled => startup.set(enabled));
    handle('update-state', () => updater.snapshot());
    handle('update-check', () => updater.check());
    handle('update-download', () => updater.download());
    handle('update-repository', () => shell.openExternal(`https://github.com/${REPOSITORY}/releases`));
    handle('update-install', async () => {
      if (testRoot) throw new Error('Instalação indisponível no teste de interface.');
      if (installingUpdate) return false;
      installingUpdate = true; micArmedUntil = 0;
      try { await updater.launchInstall(process.pid); await engine.stop(); setImmediate(() => app.quit()); return true; }
      catch (error) { installingUpdate = false; throw error; }
    });
    handle('mic-arm', () => { micArmedUntil = Date.now() + 15000; return true; });
    handle('mic-disarm', () => { micArmedUntil = 0; });
    handle('engine-prepare', (voice, tuning) => engine.prepare(voice, tuning));
    handle('engine-convert', (samples, voice) => engine.convert(samples, voice));
    handle('logs', () => shell.openPath(path.join(root, 'logs')));
    handle('driver', async () => {
      const installer = path.resolve(root, '../VCClient-Gratuito/VB-CABLE/VBCABLE_Setup_x64.exe');
      if (!fs.existsSync(installer)) throw new Error('Instalador do VB-CABLE não encontrado.');
      // The existing interactive installer requests elevation through Windows.
      const escaped = installer.replace(/'/g, "''");
      return new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath '${escaped}' -Verb RunAs`], { windowsHide: true, stdio: 'ignore' });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve(true) : reject(new Error('Instalação não aberta. Autorize a janela do Windows para continuar.')));
      });
    });
    registerShortcuts();
    window = new BrowserWindow({ width: 1180, height: 800, minWidth: 860, minHeight: 660, backgroundColor: '#111315', title: 'Voiz', icon: path.join(__dirname, 'icon.ico'), autoHideMenuBar: true, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!isAppPage(url)) event.preventDefault(); });
    window.webContents.on('render-process-gone', () => engine.stop());
    if (!testRoot && !process.env.VOIZ_TEST_HIDE) tray = createTray({ Tray, Menu }, path.join(__dirname, 'icon.ico'), { show: showWindow, stop: () => send('shortcut', 'stop'), quit: () => app.quit() });
    closeToTray(window, () => exitRequested || installingUpdate || window.isDestroyed() || (!tray && !testRoot));
    window.on('query-session-end', () => { exitRequested = true; micArmedUntil = 0; send('shortcut', 'stop'); void engine.stop(); });
    window.once('ready-to-show', () => { if (!process.env.VOIZ_TEST_HIDE && (!startInTray || !tray)) window.show(); });
    window.loadFile(pageFile);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    exitRequested = true;
    if (quitting) return;
    event.preventDefault(); globalShortcut.unregisterAll(); micArmedUntil = 0; send('shortcut', 'stop');
    Promise.resolve(engine?.stop()).finally(() => { quitting = true; tray?.destroy(); app.quit(); });
  });
}
