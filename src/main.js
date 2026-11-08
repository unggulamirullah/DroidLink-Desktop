import { invoke } from '@tauri-apps/api/core';
import './style.css';

const root = document.querySelector('#app');
const isDesktop = Boolean(window.__TAURI_INTERNALS__);
const state = {
  page: 'dashboard',
  devices: [],
  selectedSerial: '',
  settings: {
    adbPath: '', scrcpyPath: '', preset: 'Balanced',
    mirror: { maxSize: 1920, bitrateMbps: 8, maxFps: 60, codec: 'h264', audioEnabled: true, fullscreen: false, keepAwake: true, turnScreenOff: false, alwaysOnTop: false },
  },
  status: { adbAvailable: false, scrcpyAvailable: false, activeSessions: [] },
  logs: [],
  busy: false,
};

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: '◫', group: 'WORKSPACE' },
  { id: 'devices', label: 'Devices', icon: '▣', group: 'WORKSPACE' },
  { id: 'mirroring', label: 'Screen mirroring', icon: '▤', group: 'WORKSPACE' },
  { id: 'desktop', label: 'Virtual display', icon: '▦', group: 'WORKSPACE' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'PREFERENCES' },
  { id: 'logs', label: 'Diagnostics', icon: '≋', group: 'PREFERENCES' },
];

const icon = (name) => ({
  dashboard: '◫', devices: '▣', mirroring: '▤', desktop: '▦', settings: '⚙', logs: '≋',
}[name] || '•');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function notify(message, kind = 'info') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.className = `toast ${kind}`;
  el.textContent = message;
  el.classList.add('visible');
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => el.classList.remove('visible'), 3400);
}

async function call(command, args = {}) {
  if (!isDesktop) throw new Error('Buka aplikasi melalui Tauri Desktop. Browser preview hanya menampilkan UI, bukan koneksi ADB.');
  return invoke(command, args);
}

function selectedDevice() {
  return state.devices.find((device) => device.serial === state.selectedSerial) || state.devices.find((device) => device.status === 'connected');
}

function statusChip(status) {
  const map = {
    connected: ['online', 'Connected'], unauthorized: ['warning', 'Unauthorized'],
    offline: ['muted', 'Offline'], disconnected: ['muted', 'Disconnected'], unknown: ['muted', 'Unknown'],
  };
  const [tone, label] = map[status] || map.unknown;
  return `<span class="status-chip ${tone}"><i></i>${label}</span>`;
}

function header(title, description, action = '') {
  return `<header class="page-heading"><div><div class="eyebrow">DROIDLINK / ${escapeHtml(title.toUpperCase())}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</header>`;
}

function pageDashboard() {
  const connected = state.devices.filter((d) => d.status === 'connected').length;
  const wireless = state.devices.filter((d) => d.status === 'connected' && d.connectionType === 'wireless').length;
  const sessions = state.status.activeSessions || [];
  const selected = selectedDevice();
  return `${header('Overview', 'Manage your Android connections from one place.', `<button class="btn btn-secondary" data-action="scan"><span class="btn-icon">↻</span> Scan devices</button>`)}
    <section class="welcome-panel">
      <div class="welcome-copy"><div class="eyebrow accent">ANDROID CONNECTIVITY SUITE</div><h2>Your devices.<br><span>One workspace.</span></h2><p>Mirror, control, and extend your Android screen over USB or Wi-Fi.</p><div class="welcome-actions"><button class="btn btn-primary" data-page="devices">Connect a device <span>↗</span></button><button class="btn btn-ghost" data-page="mirroring">Open mirroring</button></div></div>
      <div class="device-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="phone-frame"><div class="phone-camera"></div><div class="phone-screen"><div class="screen-top"><span>9:41</span><span>•••</span></div><div class="screen-glow"></div><div class="screen-widget"><span>DEVICE LINK</span><strong>Ready to<br>connect.</strong><i>● Secure session</i></div><div class="screen-dock"><b></b><b></b><b></b><b></b></div></div></div><div class="art-caption"><span class="live-dot"></span> DESIGNED FOR ANDROID</div></div>
    </section>
    <div class="section-row"><div><div class="eyebrow">AT A GLANCE</div><h2 class="section-title">Connection status</h2></div><span class="muted tiny">Refreshes when you scan</span></div>
    <section class="stats-grid">
      <article class="stat-card"><div class="stat-head"><span>Detected devices</span><span class="stat-icon">▣</span></div><strong>${state.devices.length}</strong><small>${connected} connected · ${state.devices.length - connected} need attention</small><div class="stat-line"><i style="width:${state.devices.length ? (connected / state.devices.length) * 100 : 0}%"></i></div></article>
      <article class="stat-card"><div class="stat-head"><span>Wireless links</span><span class="stat-icon">⌁</span></div><strong>${wireless}</strong><small>ADB over TCP/IP</small><div class="stat-line"><i style="width:${Math.min(100, wireless * 22)}%"></i></div></article>
      <article class="stat-card"><div class="stat-head"><span>Active sessions</span><span class="stat-icon">▤</span></div><strong>${sessions.length}</strong><small>${sessions.filter((s) => s.kind === 'mirroring').length} mirroring · ${sessions.filter((s) => s.kind === 'virtual-display').length} virtual display</small><div class="stat-line"><i style="width:${Math.min(100, sessions.length * 25)}%"></i></div></article>
      <article class="stat-card"><div class="stat-head"><span>Toolchain</span><span class="stat-icon">⌘</span></div><strong class="tool-state ${state.status.adbAvailable && state.status.scrcpyAvailable ? 'good' : 'needs'}">${state.status.adbAvailable && state.status.scrcpyAvailable ? 'Ready' : 'Setup'}</strong><small>ADB ${state.status.adbAvailable ? 'available' : 'missing'} · scrcpy ${state.status.scrcpyAvailable ? 'available' : 'missing'}</small><div class="tool-links"><button data-page="settings">Configure tools ↗</button></div></article>
    </section>
    <section class="bottom-grid"><article class="surface-card"><div class="card-heading"><div><div class="eyebrow">DEVICE MANAGER</div><h3>Recent devices</h3></div><button class="text-button" data-page="devices">View all ↗</button></div>${selected ? deviceCompact(selected) : `<div class="empty-state small-empty"><div class="empty-icon">▣</div><strong>No device connected</strong><p>Connect an Android device with USB debugging enabled, then scan.</p><button class="btn btn-secondary btn-small" data-page="devices">Open device manager</button></div>`}</article>
    <article class="surface-card quick-card"><div class="eyebrow">QUICK ACTIONS</div><h3>What do you want to do?</h3><button class="quick-action" data-page="mirroring"><span class="quick-symbol">▤</span><span><b>Start screen mirroring</b><small>View and control an Android screen</small></span><i>↗</i></button><button class="quick-action" data-page="desktop"><span class="quick-symbol">▦</span><span><b>Create virtual display</b><small>Launch an independent Android display</small></span><i>↗</i></button><button class="quick-action" data-page="logs"><span class="quick-symbol">≋</span><span><b>Open diagnostics</b><small>Review ADB and scrcpy logs</small></span><i>↗</i></button></article></section>`;
}

function deviceCompact(device) {
  return `<div class="device-compact"><div class="device-avatar">▣</div><div class="device-main"><strong>${escapeHtml(device.model || device.product || 'Android device')}</strong><span>${escapeHtml(device.serial)} · ${device.connectionType === 'wireless' ? 'Wi-Fi' : 'USB'} ${device.androidVersion ? `· Android ${escapeHtml(device.androidVersion)}` : ''}</span></div>${statusChip(device.status)}</div>`;
}

function pageDevices() {
  const rows = state.devices.map((d) => `<div class="device-row ${state.selectedSerial === d.serial ? 'selected' : ''}" data-device-row="${escapeHtml(d.serial)}"><button class="device-select" data-select-device="${escapeHtml(d.serial)}"><span class="device-avatar">${d.connectionType === 'wireless' ? '⌁' : '▣'}</span><span class="device-main"><strong>${escapeHtml(d.model || d.product || 'Android device')}</strong><small>${escapeHtml(d.serial)}</small></span><span class="connection-label"><i class="connection-dot ${d.connectionType}"></i>${d.connectionType === 'wireless' ? 'Wireless' : 'USB'}</span></button><div class="device-meta">${d.androidVersion ? `Android ${escapeHtml(d.androidVersion)}` : 'Version unavailable'}</div>${statusChip(d.status)}<div class="row-actions">${d.status === 'connected' ? `<button class="icon-button" title="Use device" data-use-device="${escapeHtml(d.serial)}">→</button>` : ''}${d.connectionType === 'wireless' && d.status === 'connected' ? `<button class="icon-button danger-icon" title="Disconnect" data-disconnect-serial="${escapeHtml(d.serial)}">×</button>` : ''}</div></div>`).join('');
  return `${header('Devices', 'Find Android devices, pair wireless debugging, and manage connections.', `<button class="btn btn-secondary" data-action="scan" ${state.busy ? 'disabled' : ''}><span class="btn-icon">↻</span> Scan devices</button>`)}
    <div class="tool-notice"><span class="notice-icon">i</span><div><b>Before connecting</b><p>Enable Developer options and USB debugging on Android. Keep the phone unlocked when approving the computer's RSA key prompt.</p></div><a href="https://developer.android.com/tools/adb" target="_blank" rel="noreferrer">ADB guide ↗</a></div>
    <section class="surface-card device-list-card"><div class="card-heading"><div><div class="eyebrow">DEVICE DISCOVERY</div><h3>Connected devices <span class="count-pill">${state.devices.length}</span></h3></div><span class="muted tiny">USB & Wi-Fi debugging</span></div>
    ${state.devices.length ? `<div class="device-table-head"><span>DEVICE</span><span>CONNECTION</span><span>ANDROID</span><span>STATUS</span><span></span></div>${rows}` : `<div class="empty-state"><div class="empty-icon">⌁</div><strong>No devices detected</strong><p>Connect by USB or use Wireless debugging below, then run a scan.</p><button class="btn btn-secondary btn-small" data-action="scan">Scan again</button></div>`}</section>
    <div class="connect-grid"><section class="surface-card"><div class="eyebrow">WIRELESS DEBUGGING</div><h3>Pair with a code</h3><p class="card-description">On Android 11+, open Developer options → Wireless debugging → Pair device with pairing code.</p><form id="pair-form" class="form-stack"><label>Device IP address<input name="ip" placeholder="192.168.1.24" required autocomplete="off"></label><div class="form-two"><label>Pairing port<input name="port" type="number" min="1" max="65535" placeholder="37123" required></label><label>Pairing code<input name="pairingCode" type="password" inputmode="numeric" placeholder="123456" required autocomplete="off"></label></div><button class="btn btn-primary" type="submit">Pair device <span>↗</span></button></form></section>
    <section class="surface-card"><div class="eyebrow">WIRELESS DEBUGGING</div><h3>Connect paired device</h3><p class="card-description">After pairing, return to the main Wireless debugging screen. Use the separate IP address and port shown there (not the pairing port).</p><form id="wireless-connect-form" class="form-stack"><label>Device IP address<input name="ip" placeholder="192.168.1.24" required autocomplete="off"></label><label>Connection port<input name="port" type="number" min="1" max="65535" placeholder="42001" required></label><button class="btn btn-primary" type="submit">Connect paired device ↗</button></form></section>
    <section class="surface-card"><div class="eyebrow">ADB TCP/IP</div><h3>Enable legacy TCP/IP</h3><p class="card-description">Use this for legacy TCP/IP mode. Plug USB in first, select an authorized device, then enable TCP/IP.</p><form id="tcpip-form" class="form-stack"><label>USB device<select name="serial" required>${state.devices.filter((d) => d.status === 'connected' && d.connectionType === 'usb').map((d) => `<option value="${escapeHtml(d.serial)}" ${d.serial === state.selectedSerial ? 'selected' : ''}>${escapeHtml(d.model || d.serial)} · ${escapeHtml(d.serial)}</option>`).join('') || '<option value="">No authorized USB device</option>'}</select></label><div class="form-two"><label>Device IP<input name="ip" placeholder="192.168.1.24" required></label><label>Port<input name="port" type="number" min="1" max="65535" value="5555" required></label></div><button class="btn btn-secondary" type="submit" ${!state.devices.some((d) => d.status === 'connected' && d.connectionType === 'usb') ? 'disabled' : ''}>Enable TCP/IP & connect</button></form></section></div>`;
}

function mirrorControls() {
  const m = state.settings.mirror;
  return `<div class="settings-grid"><label>Maximum resolution<select name="maxSize"><option value="720" ${m.maxSize === 720 ? 'selected' : ''}>720p</option><option value="1024" ${m.maxSize === 1024 ? 'selected' : ''}>1024p</option><option value="1280" ${m.maxSize === 1280 ? 'selected' : ''}>1280p</option><option value="1600" ${m.maxSize === 1600 ? 'selected' : ''}>1600p</option><option value="1920" ${m.maxSize === 1920 ? 'selected' : ''}>1920p</option><option value="2560" ${m.maxSize === 2560 ? 'selected' : ''}>2560p</option></select></label><label>Bitrate<select name="bitrateMbps">${[2,4,6,8,12,16,20,32,50].map((n) => `<option value="${n}" ${m.bitrateMbps === n ? 'selected' : ''}>${n} Mbps</option>`).join('')}</select></label><label>Frame rate<select name="maxFps">${[15,24,30,45,60,90,120].map((n) => `<option value="${n}" ${m.maxFps === n ? 'selected' : ''}>${n} FPS</option>`).join('')}</select></label><label>Video codec<select name="codec"><option value="h264" ${m.codec === 'h264' ? 'selected' : ''}>H.264 · Compatible</option><option value="h265" ${m.codec === 'h265' ? 'selected' : ''}>H.265 · Efficient</option></select></label></div><div class="toggle-grid"><label class="toggle-row"><span><b>Forward audio</b><small>Android 11+ recommended</small></span><input type="checkbox" name="audioEnabled" ${m.audioEnabled ? 'checked' : ''}><i></i></label><label class="toggle-row"><span><b>Keep device awake</b><small>Prevent display sleep during session</small></span><input type="checkbox" name="keepAwake" ${m.keepAwake ? 'checked' : ''}><i></i></label><label class="toggle-row"><span><b>Turn phone screen off</b><small>Mirroring window remains active</small></span><input type="checkbox" name="turnScreenOff" ${m.turnScreenOff ? 'checked' : ''}><i></i></label><label class="toggle-row"><span><b>Always on top</b><small>Keep scrcpy above other windows</small></span><input type="checkbox" name="alwaysOnTop" ${m.alwaysOnTop ? 'checked' : ''}><i></i></label><label class="toggle-row"><span><b>Start fullscreen</b><small>Open the mirroring window fullscreen</small></span><input type="checkbox" name="fullscreen" ${m.fullscreen ? 'checked' : ''}><i></i></label></div>`;
}

function pageMirroring() {
  const device = selectedDevice();
  const active = (state.status.activeSessions || []).find((s) => s.kind === 'mirroring' && s.serial === device?.serial);
  return `${header('Screen mirroring', 'Stream your Android screen and control it with a mouse and keyboard.')}
    <div class="mirror-layout"><section class="surface-card mirror-preview"><div class="card-heading"><div><div class="eyebrow">LIVE SESSION</div><h3>Device screen</h3></div>${active ? '<span class="status-chip online"><i></i> Session running</span>' : '<span class="status-chip muted"><i></i> Not started</span>'}</div>
      <div class="preview-stage"><div class="preview-phone"><div class="preview-camera"></div><div class="preview-content"><span class="preview-time">09:41</span><div class="preview-mark">DL</div><b>${active ? 'Mirroring is active' : 'Ready when you are'}</b><small>${active ? 'The scrcpy window is running separately.' : 'Your Android screen will open in a native scrcpy window.'}</small><div class="preview-hint">${active ? `Process ID ${active.pid ?? '—'}` : 'USB · Wi-Fi'}</div></div></div></div>
      <div class="preview-footer"><div class="selected-device-line"><span class="device-avatar">▣</span><span><b>${escapeHtml(device?.model || 'No device selected')}</b><small>${device ? escapeHtml(device.serial) : 'Select an authorized device first'}</small></span></div><div class="session-actions">${active ? `<button class="btn btn-danger btn-small" data-action="stop-mirror">Stop session</button>` : `<button class="btn btn-primary btn-small" data-action="start-mirror" ${!device || device.status !== 'connected' ? 'disabled' : ''}>Start mirroring ↗</button>`}</div></div>
    </section><section class="surface-card mirror-settings"><div class="eyebrow">STREAM CONFIGURATION</div><h3>Performance & controls</h3><p class="card-description">Settings apply to the next session. H.265 availability depends on device encoder support.</p><form id="mirror-form" class="form-stack">${mirrorControls()}<button class="btn btn-secondary" type="submit">Save mirroring settings</button></form></section></div>
    <div class="info-strip"><span>⌘</span><p><b>Keyboard & mouse control:</b> scrcpy maps mouse clicks and keyboard input to Android. Some Xiaomi devices require the separate <em>USB debugging (Security settings)</em> toggle for input injection.</p><a href="https://github.com/Genymobile/scrcpy" target="_blank" rel="noreferrer">scrcpy guide ↗</a></div>`;
}

function pageDesktop() {
  const device = selectedDevice();
  const active = (state.status.activeSessions || []).find((s) => s.kind === 'virtual-display' && s.serial === device?.serial);
  return `${header('Virtual display', 'Run Android apps on a separate virtual screen when the device supports it.')}
    <div class="desktop-banner"><div class="desktop-icon">▦</div><div><div class="eyebrow accent">SCRCPY VIRTUAL DISPLAY</div><h2>A second Android display.</h2><p>This creates a separate Android display surface. It is not a Samsung DeX replacement and app compatibility is determined by Android and the device manufacturer.</p></div></div>
    <div class="connect-grid desktop-grid"><section class="surface-card"><div class="eyebrow">DISPLAY CONFIGURATION</div><h3>New display</h3><p class="card-description">Choose a resolution for the virtual display. The scrcpy window opens separately from your main phone screen.</p><form id="virtual-form" class="form-stack"><label>Android device<select name="serial" required>${state.devices.filter((d) => d.status === 'connected').map((d) => `<option value="${escapeHtml(d.serial)}" ${d.serial === device?.serial ? 'selected' : ''}>${escapeHtml(d.model || d.serial)} · ${escapeHtml(d.serial)}</option>`).join('') || '<option value="">No connected device</option>'}</select></label><div class="form-two"><label>Width<input name="width" type="number" value="1920" min="640" max="3840" required></label><label>Height<input name="height" type="number" value="1080" min="480" max="2160" required></label></div><label>Launch app package <span class="optional">OPTIONAL</span><input name="appPackage" placeholder="com.android.settings" autocomplete="off"></label><div class="session-actions full-actions">${active ? `<button class="btn btn-danger" type="button" data-action="stop-virtual">Close virtual display</button>` : `<button class="btn btn-primary" type="submit" ${!device ? 'disabled' : ''}>Create virtual display ↗</button>`}</div></form></section>
    <section class="surface-card compatibility-card"><div class="eyebrow">COMPATIBILITY</div><h3>What to expect</h3><div class="compat-row"><span class="compat-check">✓</span><div><b>Separate Android display</b><small>scrcpy uses Android's virtual display facility where supported.</small></div></div><div class="compat-row"><span class="compat-check">✓</span><div><b>Independent app window</b><small>Launch apps that support secondary displays; not every app will.</small></div></div><div class="compat-row"><span class="compat-warn">!</span><div><b>OS and device dependent</b><small>Manufacturer policies, Android version, and app behavior affect support.</small></div></div><div class="compat-note">The app checks whether scrcpy exposes <code>--new-display</code> before launch. Some devices have no launcher on the new display; in that case, enter an app package above. Android-side support is confirmed only when scrcpy actually starts the session.</div></section></div>`;
}

function pageSettings() {
  return `${header('Settings', 'Configure external tools and default streaming behavior.')}
    <div class="settings-page-grid"><section class="surface-card"><div class="eyebrow">DEPENDENCIES</div><h3>Tool locations</h3><p class="card-description">DroidLink can use bundled binaries or explicit executable paths. On Windows, keep the scrcpy DLLs and companion files beside scrcpy.exe.</p><form id="tools-form" class="form-stack"><label>ADB executable path <span class="optional">OPTIONAL</span><input name="adbPath" value="${escapeHtml(state.settings.adbPath || '')}" placeholder="C:\\Android\\platform-tools\\adb.exe"></label><label>scrcpy executable path <span class="optional">OPTIONAL</span><input name="scrcpyPath" value="${escapeHtml(state.settings.scrcpyPath || '')}" placeholder="C:\\Tools\\scrcpy\\scrcpy.exe"></label><div class="settings-divider"></div><div class="eyebrow">DEFAULT PERFORMANCE</div><label>Preset<select name="preset"><option ${state.settings.preset === 'Low Latency' ? 'selected' : ''}>Low Latency</option><option ${state.settings.preset === 'Balanced' ? 'selected' : ''}>Balanced</option><option ${state.settings.preset === 'High Quality' ? 'selected' : ''}>High Quality</option><option ${state.settings.preset === 'Custom' ? 'selected' : ''}>Custom</option></select></label>${mirrorControls()}<button class="btn btn-primary" type="submit">Save preferences</button></form></section>
    <section class="surface-card tool-health"><div class="eyebrow">ENVIRONMENT CHECK</div><h3>Toolchain status</h3><div class="health-item"><span class="health-icon">⌘</span><div><b>Android Debug Bridge</b><small>${state.status.adbAvailable ? 'Executable detected' : 'Not detected'}</small></div>${state.status.adbAvailable ? '<span class="health-ok">READY</span>' : '<span class="health-missing">MISSING</span>'}</div><div class="health-item"><span class="health-icon">▤</span><div><b>scrcpy</b><small>${state.status.scrcpyAvailable ? 'Executable detected' : 'Not detected'}</small></div>${state.status.scrcpyAvailable ? '<span class="health-ok">READY</span>' : '<span class="health-missing">MISSING</span>'}</div><button class="btn btn-secondary btn-block" data-action="check-tools">Run environment check ↻</button><div class="settings-divider"></div><div class="eyebrow">DISTRIBUTION</div><p class="small-note">For a portable release, place the official Android Platform Tools and the complete official scrcpy Windows package in <code>src-tauri/resources/</code> before bundling. Required DLLs must remain alongside scrcpy.exe.</p><a class="external-link" href="https://developer.android.com/tools/releases/platform-tools" target="_blank" rel="noreferrer">Android Platform Tools ↗</a><a class="external-link" href="https://github.com/Genymobile/scrcpy/releases" target="_blank" rel="noreferrer">Official scrcpy releases ↗</a></section></div>`;
}

function pageLogs() {
  const entries = [...state.logs].reverse();
  return `${header('Diagnostics', 'Inspect ADB commands, scrcpy output, and connection errors.', `<div class="heading-actions"><button class="btn btn-secondary" data-action="refresh-logs">↻ Refresh</button><button class="btn btn-ghost" data-action="clear-logs">Clear logs</button></div>`)}
    <section class="surface-card logs-card"><div class="logs-toolbar"><span><i class="live-dot"></i> Local session log</span><span>${entries.length} entries · max 500</span></div>${entries.length ? `<div class="log-list">${entries.map((log) => `<div class="log-row"><time>${formatTimestamp(log.timestamp)}</time><span class="log-level ${escapeHtml(log.level)}">${escapeHtml(log.level.toUpperCase())}</span><b>${escapeHtml(log.source)}</b><p>${escapeHtml(log.message)}</p></div>`).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">≋</div><strong>No diagnostics yet</strong><p>ADB and scrcpy activity will appear here after you interact with a device.</p></div>`}</section>`;
}

function formatTimestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Date(number * 1000).toLocaleTimeString([], { hour12: false });
}

function render() {
  const current = navItems.find((item) => item.id === state.page) || navItems[0];
  let content = '';
  if (state.page === 'dashboard') content = pageDashboard();
  if (state.page === 'devices') content = pageDevices();
  if (state.page === 'mirroring') content = pageMirroring();
  if (state.page === 'desktop') content = pageDesktop();
  if (state.page === 'settings') content = pageSettings();
  if (state.page === 'logs') content = pageLogs();
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark"><span></span><span></span><span></span></div><div><b>DroidLink</b><small>DESKTOP</small></div></div><div class="workspace-chip"><div class="workspace-orb">D</div><span><b>My workspace</b><small>Local environment</small></span><i>⌄</i></div><nav class="side-nav">${['WORKSPACE', 'PREFERENCES'].map((group) => `<div class="nav-group-label">${group}</div>${navItems.filter((n) => n.group === group).map((n) => `<button class="nav-item ${n.id === current.id ? 'active' : ''}" data-page="${n.id}"><span class="nav-icon">${icon(n.id)}</span>${n.label}${n.id === 'devices' && state.devices.length ? `<em>${state.devices.length}</em>` : ''}</button>`).join('')}`).join('')}</nav><div class="sidebar-bottom"><div class="connection-health"><span class="health-pulse ${state.status.adbAvailable && state.status.scrcpyAvailable ? 'good' : ''}"></span><div><b>${state.status.adbAvailable && state.status.scrcpyAvailable ? 'System ready' : 'Setup required'}</b><small>ADB & scrcpy toolchain</small></div><button aria-label="Open settings" data-page="settings">↗</button></div><div class="sidebar-version">DROIDLINK DESKTOP <span>v0.1.0</span></div></div></aside><main class="main-area"><div class="topbar"><div class="breadcrumb"><span>Workspace</span><i>/</i><b>${current.label}</b></div><div class="topbar-right"><span class="platform-pill"><i></i> ${isDesktop ? 'Windows desktop' : 'Browser preview'}</span><button class="avatar-button" data-page="settings" title="Settings">U</button></div></div><div class="page-content">${content}<footer class="app-footer"><span>© 2026 DroidLink Desktop</span><span>Built for local Android connectivity</span></footer></div></main></div>`;
}

async function refreshStatus() {
  if (!isDesktop) return;
  try { state.status = await call('get_app_status'); } catch (error) { notify(error.message, 'error'); }
}

async function scanDevices() {
  state.busy = true;
  render();
  try {
    state.devices = await call('scan_devices');
    if (!state.devices.some((d) => d.serial === state.selectedSerial)) state.selectedSerial = state.devices.find((d) => d.status === 'connected')?.serial || '';
    state.status = await call('get_app_status');
    notify(`${state.devices.length} device(s) detected.`, 'success');
  } catch (error) { notify(error.message, 'error'); }
  finally { state.busy = false; render(); }
}

async function refreshLogs() {
  try { state.logs = await call('get_logs'); render(); }
  catch (error) { notify(error.message, 'error'); }
}

function collectMirrorSettings(form) {
  const data = new FormData(form);
  return {
    maxSize: Number(data.get('maxSize')),
    bitrateMbps: Number(data.get('bitrateMbps')),
    maxFps: Number(data.get('maxFps')),
    codec: String(data.get('codec')),
    audioEnabled: data.has('audioEnabled'),
    fullscreen: data.has('fullscreen'),
    keepAwake: data.has('keepAwake'),
    turnScreenOff: data.has('turnScreenOff'),
    alwaysOnTop: data.has('alwaysOnTop'),
  };
}

async function saveFormSettings(form, includePaths = false) {
  const data = new FormData(form);
  const mirror = collectMirrorSettings(form);
  const settings = {
    ...state.settings,
    mirror,
    preset: String(data.get('preset') || state.settings.preset || 'Custom'),
  };
  if (includePaths) {
    settings.adbPath = String(data.get('adbPath') || '').trim();
    settings.scrcpyPath = String(data.get('scrcpyPath') || '').trim();
  }
  await call('save_settings', { settings });
  state.settings = settings;
  notify('Settings saved.', 'success');
}

root.addEventListener('click', async (event) => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    state.page = pageButton.dataset.page;
    render();
    if (state.page === 'logs') refreshLogs();
    if (state.page === 'devices' && state.devices.length === 0) scanDevices();
    return;
  }
  const select = event.target.closest('[data-select-device], [data-use-device]');
  if (select) {
    state.selectedSerial = select.dataset.selectDevice || select.dataset.useDevice;
    render();
    return;
  }
  const disconnect = event.target.closest('[data-disconnect-serial]');
  if (disconnect) {
    const serial = disconnect.dataset.disconnectSerial;
    let ip; let portText;
    if (serial.startsWith('[') && serial.includes(']')) {
      const close = serial.indexOf(']');
      ip = serial.slice(1, close);
      portText = serial.slice(close + 2);
    } else {
      const split = serial.lastIndexOf(':');
      if (split < 1) return notify('Cannot determine the wireless endpoint.', 'error');
      ip = serial.slice(0, split);
      portText = serial.slice(split + 1);
    }
    try {
      await call('adb_disconnect', { ip, port: Number(portText) });
      notify('Wireless device disconnected.', 'success');
      await scanDevices();
    } catch (error) { notify(error.message, 'error'); }
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  try {
    if (action === 'scan') return scanDevices();
    if (action === 'start-mirror') {
      const device = selectedDevice();
      if (!device) throw new Error('Select a connected device first.');
      const form = document.querySelector('#mirror-form');
      const settings = form ? collectMirrorSettings(form) : state.settings.mirror;
      await call('start_mirroring', { serial: device.serial, settings });
      notify('Mirroring process started. Check the scrcpy window.', 'success');
      await refreshStatus(); render();
    }
    if (action === 'stop-mirror') {
      const device = selectedDevice();
      const session = state.status.activeSessions?.find((s) => s.kind === 'mirroring' && s.serial === device?.serial);
      await call('stop_mirroring', { serial: session?.serial || device?.serial });
      await refreshStatus(); render(); notify('Mirroring stopped.', 'success');
    }
    if (action === 'stop-virtual') {
      const device = selectedDevice();
      const session = state.status.activeSessions?.find((s) => s.kind === 'virtual-display' && s.serial === device?.serial);
      if (!session) throw new Error('No virtual display session is active.');
      await call('stop_virtual_display', { serial: session.serial });
      await refreshStatus(); render(); notify('Virtual display closed.', 'success');
    }
    if (action === 'check-tools') {
      const result = await call('check_toolchain');
      state.status.adbAvailable = Boolean(result.adbVersion);
      state.status.scrcpyAvailable = Boolean(result.scrcpyVersion);
      render();
      notify(result.warnings.length ? result.warnings.join(' ') : 'ADB and scrcpy are ready.', result.warnings.length ? 'warning' : 'success');
    }
    if (action === 'refresh-logs') await refreshLogs();
    if (action === 'clear-logs') { await call('clear_logs'); state.logs = []; render(); notify('Logs cleared.', 'success'); }
  } catch (error) { notify(error.message || String(error), 'error'); }
});


root.addEventListener('change', (event) => {
  if (event.target.name !== 'preset') return;
  const presets = {
    'Low Latency': { maxSize: 1024, bitrateMbps: 4, maxFps: 60, codec: 'h264', audioEnabled: false, fullscreen: false, keepAwake: true, turnScreenOff: false, alwaysOnTop: false },
    'Balanced': { maxSize: 1920, bitrateMbps: 8, maxFps: 60, codec: 'h264', audioEnabled: true, fullscreen: false, keepAwake: true, turnScreenOff: false, alwaysOnTop: false },
    'High Quality': { maxSize: 2560, bitrateMbps: 20, maxFps: 60, codec: 'h265', audioEnabled: true, fullscreen: false, keepAwake: true, turnScreenOff: false, alwaysOnTop: false },
  };
  state.settings.preset = event.target.value;
  if (presets[event.target.value]) state.settings.mirror = { ...presets[event.target.value] };
  render();
  notify(event.target.value === 'Custom' ? 'Custom mode selected. Adjust individual stream settings.' : `${event.target.value} preset applied. Save preferences to persist it.`, 'info');
});

root.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === 'pair-form') {
      const result = await call('adb_pair', { ip: String(data.get('ip')), port: Number(data.get('port')), pairingCode: String(data.get('pairingCode')) });
      notify(result, 'success');
      form.reset();
      await scanDevices();
    }
    if (form.id === 'wireless-connect-form') {
      const result = await call('adb_connect', { ip: String(data.get('ip')), port: Number(data.get('port')) });
      notify(result, 'success');
      await scanDevices();
    }
    if (form.id === 'tcpip-form') {
      const serial = String(data.get('serial'));
      if (!serial) throw new Error('Choose an authorized USB device.');
      const result = await call('adb_tcpip_connect', { serial, ip: String(data.get('ip')), port: Number(data.get('port')) });
      notify(result, 'success');
      await scanDevices();
    }
    if (form.id === 'mirror-form') {
      await saveFormSettings(form);
    }
    if (form.id === 'virtual-form') {
      const serial = String(data.get('serial'));
      if (!serial) throw new Error('Choose a connected Android device.');
      state.selectedSerial = serial;
      const settings = state.settings.mirror;
      const appPackage = String(data.get('appPackage') || '').trim();
      const result = await call('start_virtual_display', { serial, width: Number(data.get('width')), height: Number(data.get('height')), appPackage: appPackage || null, settings });
      await refreshStatus(); render(); notify(result, 'success');
    }
    if (form.id === 'tools-form') {
      await saveFormSettings(form, true);
      await refreshStatus(); render();
    }
  } catch (error) { notify(error.message || String(error), 'error'); }
});

async function boot() {
  render();
  if (!isDesktop) {
    notify('Browser preview mode: run with npm run tauri dev to enable ADB and scrcpy.', 'warning');
    return;
  }
  const results = await Promise.allSettled([
    call('get_settings'), call('get_app_status'), call('scan_devices'), call('get_logs'),
  ]);
  if (results[0].status === 'fulfilled') {
    const settings = results[0].value;
    state.settings = { ...state.settings, ...settings, adbPath: settings.adbPath || '', scrcpyPath: settings.scrcpyPath || '' };
  }
  if (results[1].status === 'fulfilled') state.status = results[1].value;
  if (results[2].status === 'fulfilled') {
    state.devices = results[2].value;
    state.selectedSerial = state.devices.find((d) => d.status === 'connected')?.serial || '';
  } else notify(results[2].reason?.message || 'Device discovery is unavailable. Check the ADB path in Settings.', 'warning');
  if (results[3].status === 'fulfilled') state.logs = results[3].value;
  render();
  window.setInterval(async () => {
    await refreshStatus();
    if (state.page === 'logs') await refreshLogs();
    else {
      const focused = document.activeElement;
      const editing = focused && ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName);
      if (!editing) render();
    }
  }, 7000);
}

boot();
