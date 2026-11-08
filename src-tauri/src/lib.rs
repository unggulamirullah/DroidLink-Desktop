mod adb;
mod commands;
mod config;
mod models;
mod scrcpy;
mod state;

use state::AppState;
use tauri::Manager;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .try_init();

    tauri::Builder::default()
        .setup(|app| {
            let settings = config::load_settings(app.handle()).unwrap_or_default();
            app.manage(AppState::new(settings));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_status,
            commands::scan_devices,
            commands::get_device_info,
            commands::adb_pair,
            commands::adb_connect,
            commands::adb_disconnect,
            commands::adb_tcpip_connect,
            commands::start_mirroring,
            commands::stop_mirroring,
            commands::start_virtual_display,
            commands::stop_virtual_display,
            commands::get_settings,
            commands::save_settings,
            commands::get_logs,
            commands::clear_logs,
            commands::check_toolchain
        ])
        .run(tauri::generate_context!())
        .expect("DroidLink Desktop failed to start");
}
