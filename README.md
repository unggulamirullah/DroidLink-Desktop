# DroidLink Desktop

Windows x64 desktop application for Android screen mirroring and control. The desktop UI is built with **Tauri 2 + Vite**, the native backend is **Rust**, device communication uses **ADB**, and screen mirroring/input injection is delegated to the official **scrcpy** executable.

> **Project status (0.1.0):** initial implementation. Device discovery, ADB pairing/connect/disconnect, legacy TCP/IP mode, scrcpy mirroring process management, virtual-display launch checks, settings persistence, and local diagnostics are implemented in source. This repository snapshot has not yet been compiled as a Windows application or tested against a physical Android device. Do not treat this as a verified release installer.

## Why this architecture

- **Tauri 2:** a comparatively small native desktop shell with a WebView frontend and explicit capability permissions. It avoids bundling a full Chromium runtime.
- **Rust:** owns subprocess creation, input validation, device discovery, process lifecycle, persistent settings, and logs. The webview never receives a general-purpose command-execution API.
- **ADB:** uses Google's supported Android Debug Bridge for device discovery, authorization, pairing, and TCP/IP connections.
- **scrcpy:** supplies the established video/audio/control transport rather than reimplementing Android's screen capture and input protocol.
- **Vite + vanilla JavaScript:** keeps the UI dependency surface small and makes the frontend build reproducible without a large framework.

## Implemented functionality

| Area | Implementation | Status |
|---|---|---|
| Dashboard and navigation | Dark desktop UI, connection overview, quick actions | Implemented |
| Device manager | `adb devices -l`, model/product parsing, Android release lookup, USB/Wi-Fi type, status states | Implemented in source |
| USB workflow | Detection and authorization status guidance | Implemented in source |
| Wireless pairing | Validated IP/port and transient pairing code, `adb pair` | Implemented in source |
| Wireless connection | `adb connect`, `adb disconnect` | Implemented in source |
| Legacy TCP/IP | `adb -s SERIAL tcpip PORT` then wireless connect | Implemented in source |
| Mirroring | Managed scrcpy child process, H.264/H.265, size, bitrate, FPS, audio, fullscreen, keep-active, screen-off, always-on-top | Implemented in source |
| Virtual display | Capability check for `--new-display`, separate process lifecycle | Implemented in source; device compatibility unverified |
| Settings | Persisted in the OS app config directory, optional executable overrides | Implemented in source |
| Diagnostics | Bounded 500-line in-memory log buffer | Implemented in source |
| Installer | NSIS target configured | Not built in this environment |
| Physical-device testing | No Android device attached to this Linux build workspace | Not run |

## Project structure

```text
.
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js                  # UI and Tauri command bindings
│   └── style.css                # dark desktop interface
├── docs/
│   ├── ARCHITECTURE.md
│   └── TESTING.md
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── resources/
    │   ├── platform-tools/      # place adb.exe and companion DLLs here
    │   └── scrcpy/              # place full official scrcpy package here
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── commands.rs
        ├── config.rs
        ├── models.rs
        ├── state.rs
        ├── adb/{mod.rs,parser.rs}
        └── scrcpy/mod.rs
```

## Windows development prerequisites

1. Windows 10 (1803+) or Windows 11, x64.
2. Node.js 22 LTS/current and npm.
3. Rust stable via rustup (MSVC target).
4. Microsoft Visual Studio 2022 Build Tools with **Desktop development with C++** (MSVC, Windows SDK).
5. Microsoft Edge WebView2 Runtime.
6. Official Android SDK Platform Tools and official scrcpy Windows release for runtime/device testing.

Tauri's Windows prerequisites are documented at <https://v2.tauri.app/start/prerequisites/>.

### Get ADB and scrcpy ready

For a self-contained bundle, place the binaries in these folders before packaging:

**`src-tauri/resources/platform-tools/`**

- `adb.exe`
- `AdbWinApi.dll`
- `AdbWinUsbApi.dll` (where provided by the Platform Tools package)

**`src-tauri/resources/scrcpy/`**

Copy the complete contents of the official Windows scrcpy release folder, not just `scrcpy.exe`. Keep the executable, server file, and every required DLL together. Use the official release repository only: <https://github.com/Genymobile/scrcpy/releases>.

The application can also use executable paths configured in **Settings** or the executable found on the system `PATH`. Custom paths must point to existing files.

### Install dependencies and run

```powershell
# From the project root
npm install
npm run tauri dev
```

Vite's standalone UI preview is:

```powershell
npm run dev
```

This preview does not have Tauri IPC and therefore cannot scan or control devices. Device features require the Tauri desktop process.

### Build the Windows installer

Run this on a Windows x64 machine with all prerequisites and runtime resources prepared:

```powershell
npm run tauri build
```

Expected NSIS artifact location:

```text
src-tauri/target/release/bundle/nsis/
```

The project config targets NSIS `.exe`. A portable folder distribution can be assembled from the release executable plus the matching Tauri resource directory and required runtime tools; it has not been generated or tested here.

## Android setup and use

### USB

1. On Android, open Settings → About phone and tap Build number repeatedly to enable Developer options (wording differs by manufacturer).
2. Enable **USB debugging** in Developer options.
3. Connect the phone with a data-capable USB cable and unlock it.
4. Accept the computer's RSA authorization prompt. If the status is `unauthorized`, the prompt has not been approved (or the authorization needs to be revoked and requested again).
5. In DroidLink, open **Devices** and scan. Select an authorized device, then open **Screen mirroring**.

### Android 11+ Wireless debugging pairing

1. Put the PC and phone on the same trusted Wi-Fi network.
2. On Android, open Developer options → Wireless debugging → Pair device with pairing code.
3. Enter the IP address, **pairing port**, and pairing code in DroidLink.
4. Return to the main Wireless debugging screen on Android. It shows a different IP/port for the active debugging endpoint.
5. Enter that second endpoint in **Connect paired device**. The pairing port and connection port are not interchangeable.

### Legacy ADB TCP/IP

1. Connect and authorize the phone over USB.
2. Get the phone's LAN IP address.
3. Select that USB device in DroidLink and run **Enable legacy TCP/IP** with the desired ADB port (commonly 5555).
4. Keep the phone and PC on the same LAN, then rescan.

### Mirroring and control

Use scrcpy 5.x or another compatible build that supports the selected flags. Choose resolution, video bitrate, FPS, codec, and audio before starting. scrcpy opens a separate native desktop window. Keyboard and mouse input is handled by scrcpy. H.265 requires device/encoder support. Audio forwarding is supported by scrcpy for Android 11+; older versions may run video only.

For some Xiaomi/Redmi devices, mouse/keyboard injection can require the separate **USB debugging (Security settings)** option. This option is distinct from regular USB debugging and may require a reboot.

### Virtual display

The virtual display page checks that the configured scrcpy build exposes `--new-display`. It then asks scrcpy to create a separate Android display at the requested resolution. This is not Samsung DeX: launcher behavior, app support, and display creation depend on Android version, OEM behavior, and the app being launched. A successful flag check is not proof that the phone supports the feature; the actual session start is the final compatibility test.

## Security notes

- Rust invokes ADB and scrcpy with argument arrays; it does not concatenate user values into a shell command.
- IP addresses are parsed as `IpAddr`; ports are constrained to `1..=65535`; device serials and pairing-code characters are validated.
- Pairing codes are passed only to the one `adb pair` invocation. They are not persisted, and the command log masks the code.
- The frontend receives named operations (pair, connect, scan, start/stop mirroring), not a generic executable/argument endpoint.
- ADB wireless debugging exposes powerful debugging access to devices on the local network. Pair only on trusted networks, disable Wireless debugging when no longer needed, and revoke unneeded authorizations from Android Developer options.
- Do not expose ADB TCP port 5555 to the public internet or forward it from a router. Use a trusted private LAN/VPN and disconnect when finished.
- The current app keeps diagnostic entries in memory only. It does not upload logs or device data.

## Dependencies and attribution

- Tauri 2 — MIT or Apache-2.0 (per upstream licensing).
- Vite — MIT.
- Rust crates — see each crate's license metadata and the generated Cargo dependency tree.
- Android SDK Platform Tools / ADB — Google's SDK Platform Tools distribution and applicable terms.
- scrcpy — Apache License 2.0. Preserve upstream notices and license when redistributing the scrcpy package. See <https://github.com/Genymobile/scrcpy/blob/master/LICENSE>.

Do not strip the third-party license and notice files when packaging. Review the exact terms attached to the binary versions you distribute.

## Current limitations

- A Windows build is mandatory for the final Windows installer and Windows-specific process behavior; this workspace currently runs Linux and does not contain Rust/Cargo.
- ADB/scrcpy Windows binaries are intentionally not bundled in this source snapshot. This avoids shipping unverified third-party binaries; download them from the official project distribution pages and include their complete supporting files.
- No physical Android device is connected to this workspace, so USB, Wireless debugging, Redmi Note 13 Pro 5G input injection, audio, FPS, and virtual display compatibility are not empirically verified.
- The current scrcpy session window is separate from the Tauri shell. In-app video embedding, drag/drop, per-device profiles, automatic Wi-Fi reconnection, and persistent log files are not part of this first implementation.
- Performance metrics (FPS, latency, CPU, RAM, network throughput) are not fabricated or shown as measured values. Benchmark instrumentation is a later testing phase.

## License

DroidLink Desktop source in this repository is provided under the MIT License. Third-party components retain their respective licenses.
