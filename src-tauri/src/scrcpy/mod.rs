use crate::{adb, models::MirrorSettings, state::{AppState, RunningSession}};
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tauri::{AppHandle, Manager};
use tokio::{io::{AsyncBufReadExt, BufReader}, process::Command, sync::Mutex};

fn executable_name() -> &'static str {
    if cfg!(windows) { "scrcpy.exe" } else { "scrcpy" }
}

pub fn resolve_scrcpy(app: &AppHandle, configured: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = configured.filter(|p| !p.trim().is_empty()) {
        let candidate = PathBuf::from(path);
        if candidate.is_file() { return Ok(candidate); }
        return Err(format!("scrcpy path does not point to a file: {}", candidate.display()));
    }
    let name = executable_name();
    let resource = app.path().resource_dir().ok();
    let candidates = resource.into_iter().flat_map(|root| [
        root.join("resources").join("scrcpy").join(name),
        root.join("scrcpy").join(name),
        root.join(name),
    ]).collect::<Vec<_>>();
    if let Some(found) = candidates.into_iter().find(|p| p.is_file()) { return Ok(found); }
    Ok(PathBuf::from(name))
}

async fn ensure_new_display_support(exe: &PathBuf) -> Result<(), String> {
    let mut command = Command::new(exe);
    command.arg("--help").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }
    let output = tokio::time::timeout(Duration::from_secs(8), command.output()).await
        .map_err(|_| "scrcpy --help timed out while checking virtual display support.".to_string())?
        .map_err(|e| format!("Could not inspect scrcpy capabilities: {e}"))?;
    let help = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    if !help.contains("--new-display") {
        return Err("This scrcpy build does not advertise --new-display. Install a newer official scrcpy release.".into());
    }
    Ok(())
}

fn build_args(serial: &str, settings: &MirrorSettings, virtual_display: Option<(u16, u16)>, app_package: Option<&str>) -> Result<Vec<String>, String> {
    settings.validate()?;
    adb::validate_serial(serial)?;
    let mut args = vec![format!("--serial={serial}")];
    args.push(format!("--max-size={}", settings.max_size));
    args.push(format!("--max-fps={}", settings.max_fps));
    args.push(format!("-b{}M", settings.bitrate_mbps));
    args.push(format!("--video-codec={}", settings.codec));
    if !settings.audio_enabled { args.push("--no-audio".into()); }
    if settings.fullscreen { args.push("--fullscreen".into()); }
    if settings.keep_awake { args.push("--keep-active".into()); }
    if settings.turn_screen_off { args.push("--turn-screen-off".into()); }
    if settings.always_on_top { args.push("--always-on-top".into()); }
    if let Some((width, height)) = virtual_display {
        if !(640..=3840).contains(&width) || !(480..=2160).contains(&height) {
            return Err("Virtual display resolution must be between 640×480 and 3840×2160.".into());
        }
        args.push(format!("--new-display={}x{}", width, height));
        if let Some(package) = app_package.filter(|value| !value.trim().is_empty()) {
            if !valid_package_name(package) {
                return Err("App package must look like com.example.app and contain only letters, digits, underscores, and dots.".into());
            }
            args.push(format!("--start-app={package}"));
        }
    } else if app_package.is_some() {
        return Err("An app package can only be supplied when creating a virtual display.".into());
    }
    Ok(args)
}

fn valid_package_name(package: &str) -> bool {
    let parts = package.split('.').collect::<Vec<_>>();
    parts.len() >= 2 && parts.iter().all(|part| {
        !part.is_empty()
            && part.chars().next().is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
            && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    })
}

pub async fn start(app: &AppHandle, state: &AppState, serial: &str, settings: MirrorSettings, kind: &str, virtual_display: Option<(u16, u16)>, app_package: Option<String>) -> Result<String, String> {
    adb::require_connected(app, state, serial).await?;
    let settings_from_disk = state.settings.read().await.clone();
    let exe = resolve_scrcpy(app, settings_from_disk.scrcpy_path.as_deref())?;
    if !exe.is_file() && exe.components().count() > 1 {
        return Err(format!("scrcpy executable not found at {}. Install it or set its path in Settings.", exe.display()));
    }
    if virtual_display.is_some() { ensure_new_display_support(&exe).await?; }
    let args = build_args(serial, &settings, virtual_display, app_package.as_deref())?;
    let key = format!("{serial}::{kind}");
    let mut sessions = state.sessions.lock().await;
    if let Some(existing) = sessions.get(&key) {
        let mut child = existing.child.lock().await;
        if child.try_wait().map_err(|e| format!("Cannot inspect existing scrcpy process: {e}"))?.is_none() {
            return Err(format!("A {kind} session is already running for this device."));
        }
    }
    sessions.remove(&key);

    let mut command = Command::new(&exe);
    command.args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    if let Some(directory) = exe.parent().filter(|path| !path.as_os_str().is_empty()) { command.current_dir(directory); }
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound { "scrcpy executable not found. Install the official Windows release and configure its path in Settings.".to_string() }
        else { format!("Could not start scrcpy: {e}") }
    })?;
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    let started_at = timestamp();
    sessions.insert(key.clone(), RunningSession { child: child.clone(), pid, serial: serial.into(), kind: kind.into(), started_at });
    drop(sessions);

    if let Some(out) = stdout { spawn_log_reader(state.logs.clone(), "scrcpy/stdout", out); }
    if let Some(err) = stderr { spawn_log_reader(state.logs.clone(), "scrcpy/stderr", err); }

    // Catch immediate CLI/ADB startup failures before reporting success to the UI.
    tokio::time::sleep(Duration::from_millis(650)).await;
    let exit_status = {
        let mut process = child.lock().await;
        process.try_wait().map_err(|e| format!("Cannot verify scrcpy startup: {e}"))?
    };
    if let Some(status) = exit_status {
        let mut sessions = state.sessions.lock().await;
        if sessions.get(&key).is_some_and(|session| session.pid == pid) {
            sessions.remove(&key);
        }
        drop(sessions);
        state.log("error", "scrcpy", format!("{kind} process exited during startup for {serial}: {status}. Review recent scrcpy output.")).await;
        return Err(format!("scrcpy exited during startup ({status}). Open Diagnostics to inspect the device or codec error."));
    }

    state.log("info", "scrcpy", format!("Started {kind} session for {serial} (PID {pid:?}); arguments: {}", args.join(" "))).await;
    Ok(format!("{kind} session started for {serial}."))
}

fn spawn_log_reader<R>(logs: Arc<Mutex<std::collections::VecDeque<crate::models::LogEntry>>>, source: &'static str, stream: R)
where R: tokio::io::AsyncRead + Unpin + Send + 'static {
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() { continue; }
            let mut entries = logs.lock().await;
            if entries.len() >= crate::state::MAX_LOG_ENTRIES { entries.pop_front(); }
            entries.push_back(crate::models::LogEntry {
                timestamp: timestamp(),
                level: if line.to_ascii_lowercase().contains("error") { "error" } else { "info" }.into(),
                source: source.into(),
                message: line,
            });
        }
    });
}

pub async fn stop(state: &AppState, serial: &str, kind: &str) -> Result<String, String> {
    adb::validate_serial(serial)?;
    let key = format!("{serial}::{kind}");
    let session = state.sessions.lock().await.remove(&key);
    if let Some(session) = session {
        let mut child = session.child.lock().await;
        if child.try_wait().map_err(|e| format!("Cannot inspect scrcpy process: {e}"))?.is_none() {
            child.kill().await.map_err(|e| format!("Cannot stop scrcpy process: {e}"))?;
            let _ = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;
        }
        state.log("info", "scrcpy", format!("Stopped {kind} session for {serial} (PID {:?})", session.pid)).await;
        Ok(format!("{kind} session stopped."))
    } else {
        Ok(format!("No active {kind} session for this device."))
    }
}

fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{:.3}", now.as_secs_f64())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_android_package_names() {
        assert!(valid_package_name("com.example.app"));
        assert!(valid_package_name("com.android.settings"));
        assert!(!valid_package_name("com"));
        assert!(!valid_package_name("com.example;whoami"));
        assert!(!valid_package_name("com..example"));
    }

    #[test]
    fn validates_virtual_display_dimensions() {
        let settings = MirrorSettings::default();
        assert!(build_args("R58M123", &settings, Some((1920, 1080)), Some("com.android.settings")).is_ok());
        assert!(build_args("R58M123", &settings, Some((320, 200)), None).is_err());
        assert!(build_args("R58M123", &settings, None, Some("com.android.settings")).is_err());
    }
}
