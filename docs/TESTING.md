# Test plan

## Unit tests in Rust

- ADB device line parser: USB, wireless, unauthorized, offline, and empty device list.
- IP validation: IPv4, IPv6, invalid address, and zero port.
- Pairing code validation and redaction from logs.
- Mirror settings: allowed resolution, FPS, bitrate, and codec boundaries.
- Serial validation and process duplicate prevention.

Run with:

```powershell
cd src-tauri
cargo test
```

## Integration test matrix (Windows + physical device)

| Test | Procedure | Expected result |
|---|---|---|
| ADB discovery | Connect one authorized USB Android device; run Scan | Serial, model/product, Android version, connected status |
| Unauthorized handling | Revoke USB debugging authorization, reconnect, do not approve prompt | Status `unauthorized`, actionable guidance |
| USB mirroring | Start mirroring for authorized USB serial | Native scrcpy window opens; mouse and keyboard work where OEM allows it |
| Wireless pairing | Android 11+ Pair device with pairing code; enter pairing endpoint/code | ADB reports successful pairing; code is absent from saved settings/logs |
| Wireless connect | Enter the separate main Wireless debugging IP/port | Wireless serial appears in the device list |
| Wireless disconnect | Disconnect wireless serial from the device row | Device disappears after scan |
| Legacy TCP/IP | USB authorized device → set IP/port → enable TCP/IP | ADB connects to `IP:PORT` |
| Duplicate process | Start the same session twice | Second start is rejected; no duplicate scrcpy process |
| Stop/cleanup | Stop each session and close app | Session process exits; no orphan scrcpy process |
| Virtual display | Use supported scrcpy and compatible Android build | Separate virtual-display scrcpy window appears; unsupported devices show the actual error |
| Settings persistence | Save settings, restart app | Values are restored from app config |

## Performance measurements (not yet run)

Record actual machine/device/network details, scrcpy version, resolution, codec, bitrate, FPS target, average observed FPS, frame drops, input-to-display latency method, CPU, RAM, and network throughput. Do not treat scrcpy's general project performance notes as a DroidLink benchmark. Compare H.264/H.265 and 720p/1080p under the same network conditions.

## Environment verification

- Frontend: `npm run build`.
- Rust/backend: `cd src-tauri && cargo test` and `cargo check`.
- Desktop integration: `npm run tauri dev` on Windows.
- Release bundle: `npm run tauri build` on Windows.
