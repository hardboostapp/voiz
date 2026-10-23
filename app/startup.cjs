const path = require('node:path');
function createStartup(app, runtime, appDir, testMode = false, launcher = null) {
  const legacy = { name: 'Voiz', path: runtime, args: [path.resolve(appDir), '--voiz-background'] };
  const options = launcher ? { name: 'Voiz', path: launcher, args: ['--voiz-background'] } : legacy;
  let simulated = false;
  function lookup(target) {
    // Electron 44 parses the lookup path as a command line (electron/electron#54364).
    // Quote only this lookup path; Electron quotes registration arguments itself.
    const state = app.getLoginItemSettings({ path: `"${target.path}"`, args: target.args });
    // launchItems.args omits switches; openAtLogin checks Electron's default name,
    // so use our named entry and its positional app path on this shared runtime.
    const positional = target.args.filter(arg => !arg.startsWith('--'));
    const entry = state.launchItems?.find(item => item.name === 'Voiz' && item.scope === 'user' && item.args?.length === positional.length && positional.every((arg,i) => item.args[i] === arg));
    const registered = !!entry;
    return { enabled: registered && entry.enabled !== false, registered, supported: true };
  }
  function snapshot() {
    if (testMode) return { enabled: simulated, registered: simulated, supported: true };
    if (process.platform !== 'win32') return { enabled: false, registered: false, supported: false };
    const current = lookup(options);
    return current.registered || !launcher ? current : lookup(legacy);
  }
  function migrate() {
    if (testMode || !launcher || process.platform !== 'win32') return snapshot();
    const current = lookup(options), previous = lookup(legacy);
    if (current.registered || !previous.registered) return snapshot();
    // Preserve Windows' disabled state; migration never opts a user into startup.
    app.setLoginItemSettings({ ...options, openAtLogin: true, enabled: previous.enabled });
    const state = lookup(options);
    if (!state.registered || state.enabled !== previous.enabled) throw new Error('O Windows não confirmou a identificação do Voiz.');
    return state;
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
  return { snapshot, set, migrate };
}
module.exports = { createStartup };
