export const WINDOWS_MONITOR = 'default';
export function isMonitorOutput(device) {
  return device?.kind === 'audiooutput' && !/VB-Audio|Voicemeeter|virtual|CABLE (?:Input|Output)/i.test(device.label);
}
export function windowsMonitor(devices) {
  const alias = devices.find(d => d.kind === 'audiooutput' && d.deviceId === WINDOWS_MONITOR);
  const outputs = devices.filter(d => d.kind === 'audiooutput' && !['default', 'communications'].includes(d.deviceId));
  const grouped = alias?.groupId ? outputs.filter(d => d.groupId === alias.groupId) : [];
  const named = alias?.label ? outputs.filter(d => d.label && alias.label.endsWith(d.label)) : [];
  const device = grouped.length === 1 ? grouped[0] : named.length === 1 ? named[0] : null;
  return { deviceId: device?.deviceId || '', blocked: !!((alias && !isMonitorOutput(alias)) || (device && !isMonitorOutput(device))) };
}
