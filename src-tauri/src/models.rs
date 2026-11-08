use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceStatus {
    Connected,
    Unauthorized,
    Offline,
    Disconnected,
    Unknown,
}

impl DeviceStatus {
    pub fn from_adb(value: &str) -> Self {
        match value {
            "device" => Self::Connected,
            "unauthorized" => Self::Unauthorized,
            "offline" => Self::Offline,
            "no device" => Self::Disconnected,
            _ => Self::Unknown,
        }
    }

    pub fn is_connected(&self) -> bool {
        matches!(self, Self::Connected)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub serial: String,
    pub status: DeviceStatus,
    pub connection_type: String,
    pub model: Option<String>,
    pub product: Option<String>,
    pub android_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MirrorSettings {
    pub max_size: u16,
    pub bitrate_mbps: u8,
    pub max_fps: u8,
    pub codec: String,
    pub audio_enabled: bool,
    pub fullscreen: bool,
    pub keep_awake: bool,
    pub turn_screen_off: bool,
    pub always_on_top: bool,
}

impl Default for MirrorSettings {
    fn default() -> Self {
        Self {
            max_size: 1920,
            bitrate_mbps: 8,
            max_fps: 60,
            codec: "h264".to_string(),
            audio_enabled: true,
            fullscreen: false,
            keep_awake: true,
            turn_screen_off: false,
            always_on_top: false,
        }
    }
}

impl MirrorSettings {
    pub fn validate(&self) -> Result<(), String> {
        if ![720, 1024, 1280, 1600, 1920, 2560].contains(&self.max_size) {
            return Err("Maximum resolution must be one of the supported presets.".into());
        }
        if !(2..=100).contains(&self.bitrate_mbps) {
            return Err("Bitrate must be between 2 and 100 Mbps.".into());
        }
        if !(15..=120).contains(&self.max_fps) {
            return Err("FPS must be between 15 and 120.".into());
        }
        if !["h264", "h265"].contains(&self.codec.as_str()) {
            return Err("Codec must be H.264 or H.265.".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub adb_path: Option<String>,
    pub scrcpy_path: Option<String>,
    pub mirror: MirrorSettings,
    pub preset: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            adb_path: None,
            scrcpy_path: None,
            mirror: MirrorSettings::default(),
            preset: "Balanced".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub source: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub serial: String,
    pub kind: String,
    pub pid: Option<u32>,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub version: String,
    pub adb_available: bool,
    pub scrcpy_available: bool,
    pub active_sessions: Vec<SessionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    pub adb_path: Option<String>,
    pub adb_version: Option<String>,
    pub scrcpy_path: Option<String>,
    pub scrcpy_version: Option<String>,
    pub warnings: Vec<String>,
}
