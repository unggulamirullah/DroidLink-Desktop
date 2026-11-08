# Architecture and command data flow

## Process boundary

```text
Tauri WebView (HTML/CSS/JS)
  │ invoke() — typed, named command surface
  ▼
Rust command handlers
  ├── Device / ADB manager ──► adb.exe
  ├── Session manager ───────► scrcpy.exe (one managed child per serial + session type)
  ├── Settings ──────────────► OS application config directory/settings.json
  └── Diagnostics ──────────► bounded 500-entry in-memory ring buffer
```

The webview cannot invoke arbitrary shell commands. Tool paths are configured separately, while command arguments are assembled and validated in Rust.

## Command contract

| Frontend command | Rust responsibility | External operation |
|---|---|---|
| `scan_devices` | Discover and parse devices; retrieve Android release for authorized devices | `adb devices -l`, `adb -s SERIAL shell getprop ro.build.version.release` |
| `get_device_info` | Return the current record for a serial | ADB scan |
| `adb_pair` | Validate IP, port, code; do not persist the code | `adb pair IP:PORT CODE` |
| `adb_connect` | Validate endpoint and handle failed-to-connect output | `adb connect IP:PORT` |
| `adb_disconnect` | Validate endpoint | `adb disconnect IP:PORT` |
| `adb_tcpip_connect` | Require authorized USB device; switch daemon; connect endpoint | `adb -s SERIAL tcpip PORT`, then `adb connect IP:PORT` |
| `start_mirroring` | Validate device/settings; prevent duplicate session; spawn and retain child handle | `scrcpy ...` |
| `stop_mirroring` | Kill and reap managed session | Child process lifecycle |
| `start_virtual_display` | Inspect scrcpy help for `--new-display`; validate resolution; spawn separate process | `scrcpy --new-display=WIDTHxHEIGHT [--start-app=PACKAGE] ...` |
| `stop_virtual_display` | Kill and reap virtual-display child | Child process lifecycle |
| `get_app_status` | Check tools and prune exited process handles | `adb version`, `scrcpy --version` |
| `get_settings` / `save_settings` | Read/validate/write app configuration atomically | Local JSON file |
| `get_logs` / `clear_logs` | Return or clear bounded diagnostic buffer | In-process |
| `check_toolchain` | Capture executable versions and warnings | ADB/scrcpy version commands |

## Process lifecycle

- Each scrcpy process is keyed by `SERIAL::mirroring` or `SERIAL::virtual-display`.
- A duplicate live session of the same type and device is rejected.
- The child has `kill_on_drop` enabled. Explicit Stop kills and waits for the process.
- stdout and stderr are read asynchronously and appended to a bounded ring buffer.
- A status refresh checks whether children exited and removes stale session records.

## Virtual display compatibility

`--new-display` is a scrcpy capability, not a guarantee that every Android build accepts a new display. The app first checks the executable's help text, then reports process launch errors. OEM and app-specific behavior still requires a device integration test.
