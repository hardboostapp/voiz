function createTray({ Tray, Menu }, icon, { show, stop, quit }) {
  const tray = new Tray(icon);
  tray.setToolTip('Voiz · sons e voz');
  tray.setContextMenu(Menu.buildFromTemplate([
    { id: 'open', label: 'Abrir Voiz', click: show },
    { id: 'stop', label: 'Parar tudo', click: stop },
    { type: 'separator' },
    { id: 'quit', label: 'Sair do Voiz', click: quit }
  ]));
  tray.on('click', show); tray.on('double-click', show);
  return tray;
}
function closeToTray(window, shouldExit) {
  window.on('close', event => {
    if (shouldExit()) return;
    event.preventDefault(); window.hide();
  });
}
module.exports = { createTray, closeToTray };
