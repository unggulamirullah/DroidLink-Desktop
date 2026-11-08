mod parser;

use crate::{models::{DeviceInfo, DeviceStatus}, state::AppState};
use std::{net::{IpAddr, SocketAddr}, path::PathBuf, process::Stdio, time::Duration};
use tauri::{AppHandle, Manager};
use tokio::process::Command;

pub use parser::parse_devices;

fn executable_name() -> &'static str {
    if cfg!(windows) { "adb.exe" } else { "adb" }
}

pub fn resolve_adb(app: &AppHandle, configured: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = configured.filter(|p| !p.trim().is_empty()) {
        let candidate = PathBuf::from(path);
        if candidate.is_file() { return Ok(candidate); }
        return Err(format!("ADB path does not point to a file: {}", candidate.display()));
    }
    let name = executable_name();
    let resource = app.path().resource_dir().ok();
    let candidates = resource.into_iter().flat_map(|root| [
        root.join("resources").join("platform-tools").join(name),
        root.join("platform-tools").join(name),
        root.join(name),
    ]).collect::<Vec<_>>();
    if let Some(found) = candidates.into_iter().find(|p| p.is_file()) { return Ok(found); }
    // A bare executable name delegates PATH lookup to the operating system.
    Ok(PathBuf::from(name))
}

pub async fn run_adb(app: &AppHandle, state: &AppState, args: &[String], timeout: Duration) -> Result<String, String> {
    let settings = state.settings.read().await.clone();
    let exe = resolve_adb(app, settings.adb_path.as_deref())?;
    let mut command = Command::new(&exe);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
    }
    let output = tokio::time::timeout(timeout, command.output()).await
        .map_err(|_| format!("ADB command timed out after {} seconds", timeout.as_secs()))?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound { "ADB executable not found. Install Android Platform Tools or set the ADB path in Settings.".to_string() }
            else { format!("Could not start ADB: {e}") }
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        state.log("error", "ADB", format!("adb {} failed: {}", safe_args_for_log(args), detail)).await;
        return Err(format!("ADB command failed ({}): {}", output.status, detail));
    }
    let detail = if stdout.is_empty() { stderr.as_str() } else { stdout.as_str() };
    state.log("info", "ADB", format!("adb {} => {}", safe_args_for_log(args), detail)).await;
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

fn safe_args_for_log(args: &[String]) -> String {
    let mut masked = args.to_vec();
    if masked.first().map(String::as_str) == Some("pair") && masked.len() >= 3 {
        masked[2] = "[REDACTED]".into();
    }
    masked.join(" ")
}

pub async fn scan(app: &AppHandle, state: &AppState) -> Result<Vec<DeviceInfo>, String> {
    let text = run_adb(app, state, &["devices".into(), "-l".into()], Duration::from_secs(12)).await?;
    let mut devices = parse_devices(&text);
    for device in devices.iter_mut().filter(|d| d.status.is_connected()) {
        let args = vec!["-s".into(), device.serial.clone(), "shell".into(), "getprop".into(), "ro.build.version.release".into()];
        if let Ok(version) = run_adb(app, state, &args, Duration::from_secs(5)).await {
            let trimmed = version.trim();
            if !trimmed.is_empty() { device.android_version = Some(trimmed.to_string()); }
        }
    }

    // Preserve recently removed devices for a short grace period so the UI can
    // explicitly show a Disconnected state instead of silently dropping them.
    let now = std::time::Instant::now();
    let current_serials = devices.iter().map(|device| device.serial.clone()).collect::<std::collections::HashSet<_>>();
    let mut cache = state.device_cache.lock().await;
    for device in &devices {
        cache.insert(device.serial.clone(), crate::state::CachedDevice {
            info: device.clone(),
            disconnected_since: None,
        });
    }
    let mut disconnected = Vec::new();
    cache.retain(|serial, cached| {
        if current_serials.contains(serial) { return true; }
        let since = *cached.disconnected_since.get_or_insert(now);
        if now.duration_since(since).as_secs() <= crate::state::DISCONNECTED_DEVICE_TTL_SECS {
            let mut info = cached.info.clone();
            info.status = DeviceStatus::Disconnected;
            disconnected.push(info);
            true
        } else { false }
    });
    drop(cache);
    devices.extend(disconnected);
    Ok(devices)
}

pub fn validate_endpoint(ip: &str, port: u16) -> Result<String, String> {
    let address: IpAddr = ip.trim().parse().map_err(|_| "Enter a valid IPv4 or IPv6 address.".to_string())?;
    if port == 0 { return Err("Port must be between 1 and 65535.".into()); }
    Ok(SocketAddr::new(address, port).to_string())
}

pub fn validate_pairing_code(code: &str) -> Result<(), String> {
    let value = code.trim();
    if value.is_empty() || value.len() > 32 || !value.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Pairing code must contain 1–32 letters or digits.".into());
    }
    Ok(())
}

pub fn validate_serial(serial: &str) -> Result<(), String> {
    if serial.is_empty() || serial.len() > 128 || !serial.chars().all(|c| c.is_ascii_alphanumeric() || "._:-".contains(c)) {
        return Err("Invalid device serial.".into());
    }
    Ok(())
}

pub async fn require_connected(app: &AppHandle, state: &AppState, serial: &str) -> Result<(), String> {
    validate_serial(serial)?;
    let devices = scan(app, state).await?;
    match devices.iter().find(|d| d.serial == serial) {
        Some(d) if d.status == DeviceStatus::Connected => Ok(()),
        Some(d) if d.status == DeviceStatus::Unauthorized => Err("Device is unauthorized. Unlock Android and approve the USB debugging prompt.".into()),
        Some(d) if d.status == DeviceStatus::Offline => Err("Device is offline. Reconnect the cable or Wi-Fi debugging session.".into()),
        Some(_) => Err("Device is not ready for ADB commands.".into()),
        None => Err("Device is no longer connected. Refresh the device list.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ipv4_ipv6_and_rejects_invalid_inputs() {
        assert_eq!(validate_endpoint("192.168.1.10", 5555).unwrap(), "192.168.1.10:5555");
        assert_eq!(validate_endpoint("2001:db8::1", 5555).unwrap(), "[2001:db8::1]:5555");
        assert!(validate_endpoint("not-an-ip", 5555).is_err());
        assert!(validate_endpoint("192.168.1.10", 0).is_err());
    }

    #[test]
    fn validates_pairing_code_without_accepting_whitespace() {
        assert!(validate_pairing_code("123456").is_ok());
        assert!(validate_pairing_code("12 34").is_err());
        assert!(validate_pairing_code("").is_err());
    }
}
