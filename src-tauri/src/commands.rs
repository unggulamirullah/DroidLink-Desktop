use crate::{
    adb,
    config,
    models::{AppSettings, AppStatus, DeviceInfo, MirrorSettings, SessionInfo, ToolchainStatus},
    scrcpy,
    state::AppState,
};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tauri::{AppHandle, State};
use tokio::process::Command;

#[tauri::command]
pub async fn scan_devices(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    let devices = adb::scan(&app, &state).await?;
    state.log("info", "Device Manager", format!("Device scan completed: {} device(s) detected.", devices.len())).await;
    Ok(devices)
}

#[tauri::command]
pub async fn get_device_info(app: AppHandle, state: State<'_, AppState>, serial: String) -> Result<DeviceInfo, String> {
    adb::validate_serial(&serial)?;
    adb::scan(&app, &state).await?.into_iter().find(|device| device.serial == serial)
        .ok_or_else(|| "Device not found. Refresh the device list.".into())
}

#[tauri::command]
pub async fn adb_pair(app: AppHandle, state: State<'_, AppState>, ip: String, port: u16, pairing_code: String) -> Result<String, String> {
    let endpoint = adb::validate_endpoint(&ip, port)?;
    adb::validate_pairing_code(&pairing_code)?;
    let result = adb::run_adb(&app, &state, &["pair".into(), endpoint, pairing_code], Duration::from_secs(25)).await?;
    let lower = result.to_ascii_lowercase();
    if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
        return Err(format!("ADB pairing was not accepted: {result}"));
    }
    state.log("info", "Wireless", "Wireless debugging pairing command completed. Pairing code was not stored.").await;
    Ok(result)
}

#[tauri::command]
pub async fn adb_connect(app: AppHandle, state: State<'_, AppState>, ip: String, port: u16) -> Result<String, String> {
    let endpoint = adb::validate_endpoint(&ip, port)?;
    let result = adb::run_adb(&app, &state, &["connect".into(), endpoint], Duration::from_secs(15)).await?;
    let lower = result.to_ascii_lowercase();
    if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
        return Err(format!("ADB could not connect: {result}"));
    }
    Ok(result)
}

#[tauri::command]
pub async fn adb_disconnect(app: AppHandle, state: State<'_, AppState>, ip: String, port: u16) -> Result<String, String> {
    let endpoint = adb::validate_endpoint(&ip, port)?;
    let result = adb::run_adb(&app, &state, &["disconnect".into(), endpoint], Duration::from_secs(12)).await?;
    Ok(result)
}

#[tauri::command]
pub async fn adb_tcpip_connect(app: AppHandle, state: State<'_, AppState>, serial: String, ip: String, port: u16) -> Result<String, String> {
    adb::require_connected(&app, &state, &serial).await?;
    let endpoint = adb::validate_endpoint(&ip, port)?;
    let switch_args = vec!["-s".into(), serial.clone(), "tcpip".into(), port.to_string()];
    let switched = adb::run_adb(&app, &state, &switch_args, Duration::from_secs(15)).await?;
    tokio::time::sleep(Duration::from_millis(900)).await;
    let connected = adb::run_adb(&app, &state, &["connect".into(), endpoint], Duration::from_secs(15)).await?;
    let lower = connected.to_ascii_lowercase();
    if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
        return Err(format!("ADB entered TCP/IP mode, but the wireless connection failed: {connected}"));
    }
    Ok(format!("{switched}\n{connected}"))
}

#[tauri::command]
pub async fn start_mirroring(app: AppHandle, state: State<'_, AppState>, serial: String, settings: Option<MirrorSettings>) -> Result<String, String> {
    let defaults = state.settings.read().await.mirror.clone();
    scrcpy::start(&app, &state, &serial, settings.unwrap_or(defaults), "mirroring", None, None).await
}

#[tauri::command]
pub async fn stop_mirroring(state: State<'_, AppState>, serial: String) -> Result<String, String> {
    scrcpy::stop(&state, &serial, "mirroring").await
}

#[tauri::command]
pub async fn start_virtual_display(app: AppHandle, state: State<'_, AppState>, serial: String, width: u16, height: u16, app_package: Option<String>, settings: Option<MirrorSettings>) -> Result<String, String> {
    let defaults = state.settings.read().await.mirror.clone();
    let settings = settings.unwrap_or(defaults);
    scrcpy::start(&app, &state, &serial, settings, "virtual-display", Some((width, height)), app_package).await
}

#[tauri::command]
pub async fn stop_virtual_display(state: State<'_, AppState>, serial: String) -> Result<String, String> {
    scrcpy::stop(&state, &serial, "virtual-display").await
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state.settings.read().await.clone())
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, state: State<'_, AppState>, mut settings: AppSettings) -> Result<(), String> {
    settings.mirror.validate()?;
    if !["Low Latency", "Balanced", "High Quality", "Custom"].contains(&settings.preset.as_str()) {
        return Err("Unknown performance preset.".into());
    }
    validate_optional_executable(settings.adb_path.as_deref(), "ADB")?;
    validate_optional_executable(settings.scrcpy_path.as_deref(), "scrcpy")?;
    settings.adb_path = settings.adb_path.take().and_then(|path| if path.trim().is_empty() { None } else { Some(path) });
    settings.scrcpy_path = settings.scrcpy_path.take().and_then(|path| if path.trim().is_empty() { None } else { Some(path) });
    config::save_settings(&app, &settings)?;
    *state.settings.write().await = settings;
    state.log("info", "Settings", "Application settings saved.").await;
    Ok(())
}

fn validate_optional_executable(path: Option<&str>, label: &str) -> Result<(), String> {
    if let Some(value) = path.filter(|p| !p.trim().is_empty()) {
        let candidate = PathBuf::from(value);
        if !candidate.is_file() { return Err(format!("{label} path is not an existing file: {}", candidate.display())); }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>) -> Result<Vec<crate::models::LogEntry>, String> {
    Ok(state.logs.lock().await.iter().cloned().collect())
}

#[tauri::command]
pub async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.logs.lock().await.clear();
    Ok(())
}

#[tauri::command]
pub async fn get_app_status(app: AppHandle, state: State<'_, AppState>) -> Result<AppStatus, String> {
    let settings = state.settings.read().await.clone();
    let adb_path = adb::resolve_adb(&app, settings.adb_path.as_deref())?;
    let scrcpy_path = scrcpy::resolve_scrcpy(&app, settings.scrcpy_path.as_deref())?;
    let adb_available = executable_works(&adb_path, &["version"], Duration::from_secs(5)).await;
    let scrcpy_available = executable_works(&scrcpy_path, &["--version"], Duration::from_secs(5)).await;

    let candidates = {
        let sessions = state.sessions.lock().await;
        sessions.iter().map(|(key, session)| (
            key.clone(),
            session.child.clone(),
            session.pid,
            session.info(),
        )).collect::<Vec<_>>()
    };
    let mut dead = Vec::<(String, Option<u32>)>::new();
    let mut active = Vec::<SessionInfo>::new();
    let mut inspect_errors = Vec::new();
    for (key, process, pid, info) in candidates {
        let mut child = process.lock().await;
        match child.try_wait() {
            Ok(Some(_)) => dead.push((key, pid)),
            Ok(None) => active.push(info),
            Err(error) => inspect_errors.push(format!("Could not inspect process {}: {error}", pid.unwrap_or_default())),
        }
    }
    if !dead.is_empty() {
        let mut sessions = state.sessions.lock().await;
        for (key, pid) in dead {
            if sessions.get(&key).is_some_and(|session| session.pid == pid) {
                sessions.remove(&key);
            }
        }
    }
    for message in inspect_errors { state.log("error", "scrcpy", message).await; }

    Ok(AppStatus { version: env!("CARGO_PKG_VERSION").into(), adb_available, scrcpy_available, active_sessions: active })
}

async fn executable_works(path: &PathBuf, args: &[&str], timeout: Duration) -> bool {
    let mut command = Command::new(path);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }
    matches!(tokio::time::timeout(timeout, command.status()).await, Ok(Ok(status)) if status.success())
}

#[tauri::command]
pub async fn check_toolchain(app: AppHandle, state: State<'_, AppState>) -> Result<ToolchainStatus, String> {
    let settings = state.settings.read().await.clone();
    let adb_path = adb::resolve_adb(&app, settings.adb_path.as_deref())?;
    let scrcpy_path = scrcpy::resolve_scrcpy(&app, settings.scrcpy_path.as_deref())?;
    let adb_output = capture_version(&adb_path, &["version"], Duration::from_secs(5)).await;
    let scrcpy_output = capture_version(&scrcpy_path, &["--version"], Duration::from_secs(5)).await;
    let mut warnings = Vec::new();
    if adb_output.is_none() { warnings.push("ADB was not found or could not be executed. Add platform-tools to the app resources or set its path in Settings.".into()); }
    if scrcpy_output.is_none() { warnings.push("scrcpy was not found or could not be executed. Add the complete official Windows scrcpy package or set its path in Settings.".into()); }
    Ok(ToolchainStatus {
        adb_path: adb_output.as_ref().map(|_| adb_path.display().to_string()),
        adb_version: adb_output,
        scrcpy_path: scrcpy_output.as_ref().map(|_| scrcpy_path.display().to_string()),
        scrcpy_version: scrcpy_output,
        warnings,
    })
}

async fn capture_version(path: &PathBuf, args: &[&str], timeout: Duration) -> Option<String> {
    let mut command = Command::new(path);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }
    let output = tokio::time::timeout(timeout, command.output()).await.ok()?.ok()?;
    if !output.status.success() { return None; }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Some(if text.is_empty() { String::from_utf8_lossy(&output.stderr).trim().to_string() } else { text })
}
