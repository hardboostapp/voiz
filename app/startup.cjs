const path = require('node:path');
function createStartup(app, runtime, appDir, testMode = false) {
  // Name is scoped to Voiz even though the developer runtime is shared.
  const options = { name: 'Voiz', path: runtime, args: [path.resolve(appDir), '--voiz-background'] };
  let simulated = false;
  function snapshot() {
    if (testMode) return { enabled: simulated, registered: simulated, supported: true };
    if (process.platform !== 'win32') return { enabled: false, registered: false, supported: false };
    // Electron 44 parses the lookup path as a command line (electron/electron#54364).
    // Quote only this lookup path; Electron quotes registration arguments itself.
    const state = app.getLoginItemSettings({ path: `"${options.path}"`, args: options.args });
    // launchItems.args omits switches; openAtLogin checks Electron's default name,
    // so use our named entry and its positional app path on this shared runtime.
    const entry = state.launchItems?.find(item => item.name === 'Voiz' && item.scope === 'user' && item.args?.length === 1 && item.args[0] === options.args[0]);
    const registered = !!entry;
    return { enabled: registered && entry.enabled !== false, registered, supported: true };
  }
  function set(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Escolha se o Voiz deve iniciar com o Windows.');
    if (testMode) { simulated = enabled; return snapshot(); }
    if (process.platform !== 'win32') throw new Error('A inicialização automática está disponível no Windows.');
    app.setLoginItemSettings({ ...options, openAtLogin: enabled, enabled });
    const state = snapshot();
    if (state.enabled !== enabled) throw new Error('O Windows não confirmou a alteração. Confira os aplicativos de inicialização nas configurações do Windows.');
    return state;
  }
  return { snapshot, set };
}
module.exports = { createStartup };
