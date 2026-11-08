use crate::models::{AppSettings, DeviceInfo, LogEntry, SessionInfo};
use std::{collections::{HashMap, VecDeque}, sync::Arc, time::Instant};
use tokio::{process::Child, sync::{Mutex, RwLock}};

pub const MAX_LOG_ENTRIES: usize = 500;
pub const DISCONNECTED_DEVICE_TTL_SECS: u64 = 45;

pub struct CachedDevice {
    pub info: DeviceInfo,
    pub disconnected_since: Option<Instant>,
}

pub struct RunningSession {
    pub child: Arc<Mutex<Child>>,
    pub pid: Option<u32>,
    pub serial: String,
    pub kind: String,
    pub started_at: String,
}

impl RunningSession {
    pub fn info(&self) -> SessionInfo {
        SessionInfo {
            serial: self.serial.clone(),
            kind: self.kind.clone(),
            pid: self.pid,
            started_at: self.started_at.clone(),
        }
    }
}

pub struct AppState {
    pub settings: RwLock<AppSettings>,
    pub sessions: Mutex<HashMap<String, RunningSession>>,
    pub device_cache: Mutex<HashMap<String, CachedDevice>>,
    pub logs: Arc<Mutex<VecDeque<LogEntry>>>,
}

impl AppState {
    pub fn new(settings: AppSettings) -> Self {
        Self {
            settings: RwLock::new(settings),
            sessions: Mutex::new(HashMap::new()),
            device_cache: Mutex::new(HashMap::new()),
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_LOG_ENTRIES))),
        }
    }

    pub async fn log(&self, level: &str, source: &str, message: impl Into<String>) {
        let entry = LogEntry {
            timestamp: chrono_free_timestamp(),
            level: level.to_string(),
            source: source.to_string(),
            message: message.into(),
        };
        let mut logs = self.logs.lock().await;
        if logs.len() >= MAX_LOG_ENTRIES {
            logs.pop_front();
        }
        logs.push_back(entry);
    }
}

fn chrono_free_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{:.3}", now.as_secs_f64())
}
