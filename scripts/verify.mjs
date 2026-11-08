import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const parseJson = (relative) => JSON.parse(read(relative));
const checks = [];
const check = (name, condition, detail = '') => {
  checks.push({ name, passed: Boolean(condition), detail });
};

const pkg = parseJson('package.json');
const tauri = parseJson('src-tauri/tauri.conf.json');
const capability = parseJson('src-tauri/capabilities/default.json');
const rust = read('src-tauri/src/lib.rs');
const commands = read('src-tauri/src/commands.rs');
const adb = read('src-tauri/src/adb/mod.rs');
const scrcpy = read('src-tauri/src/scrcpy/mod.rs');
const frontend = read('src/main.js');

check('package and Tauri versions match', pkg.version === tauri.version && pkg.version === '0.1.0');
check('Tauri 2 capability is least-privilege', capability.permissions.length === 1 && capability.permissions[0] === 'core:default');
check('NSIS installer target configured', tauri.bundle.targets.includes('nsis'));
check('Windows icon exists', fs.existsSync(path.join(root, 'src-tauri/icons/icon.ico')));
check('Frontend output directory configured', tauri.build.frontendDist === '../dist');
check('ADB and scrcpy resource placeholders exist',
  fs.existsSync(path.join(root, 'src-tauri/resources/platform-tools/README.txt')) &&
  fs.existsSync(path.join(root, 'src-tauri/resources/scrcpy/README.txt')));
check('No generic shell command concatenation', !/\.shell\s*\(/.test(`${adb}\n${scrcpy}\n${commands}`));
check('ADB subprocesses use argument arrays', /command\.args\(args\)/.test(adb));
check('scrcpy subprocesses use argument arrays', /command\.args\(&args\)/.test(scrcpy));
check('Pairing code is redacted in logs', /\[REDACTED\]/.test(adb) && /pairing code was not stored/i.test(commands));
check('Disconnected-device state is cached briefly', /DISCONNECTED_DEVICE_TTL_SECS/.test(read('src-tauri/src/state.rs')) && /DeviceStatus::Disconnected/.test(adb));
check('Virtual display is capability-checked', /ensure_new_display_support/.test(scrcpy) && /--new-display/.test(scrcpy));
check('Every registered Tauri command has a handler', [...rust.matchAll(/commands::([a-z_]+)/g)].every((match) => new RegExp(`pub async fn ${match[1]}\\b`).test(commands)));
check('Frontend references named backend commands', ['scan_devices','adb_pair','adb_connect','adb_disconnect','adb_tcpip_connect','start_mirroring','stop_mirroring','start_virtual_display','stop_virtual_display','get_app_status','get_settings','save_settings','get_logs','clear_logs','check_toolchain'].every((name) => frontend.includes(`'${name}'`)));

for (const file of ['src/main.js', 'vite.config.js', 'scripts/verify.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    check(`JavaScript syntax: ${file}`, true);
  } catch (error) {
    check(`JavaScript syntax: ${file}`, false, String(error.stderr || error.message));
  }
}

const failed = checks.filter((entry) => !entry.passed);
for (const entry of checks) {
  process.stdout.write(`${entry.passed ? 'PASS' : 'FAIL'}  ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}\n`);
}
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} structural checks passed.\n`);
if (failed.length) process.exitCode = 1;
