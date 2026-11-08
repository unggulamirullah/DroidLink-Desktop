use crate::models::AppSettings;
use std::{fs, io::Write, path::PathBuf};
use tauri::{AppHandle, Manager};
use tempfile::NamedTempFile;

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| format!("Cannot resolve application config directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create config directory: {e}"))?;
    Ok(dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = fs::read_to_string(path).map_err(|e| format!("Cannot read settings: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("Settings file is invalid: {e}"))
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path.parent().ok_or_else(|| "Cannot resolve settings directory.".to_string())?;
    let data = serde_json::to_vec_pretty(settings).map_err(|e| format!("Cannot serialize settings: {e}"))?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|e| format!("Cannot create temporary settings file: {e}"))?;
    temporary.write_all(&data).map_err(|e| format!("Cannot write settings: {e}"))?;
    temporary.as_file().sync_all().map_err(|e| format!("Cannot flush settings: {e}"))?;
    temporary.persist(&path).map_err(|e| format!("Cannot replace settings: {}", e.error))?;
    Ok(())
}
