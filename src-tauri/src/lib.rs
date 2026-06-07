#![allow(dead_code)]

mod commands;
mod core;
mod download;
mod runtime;
mod settings;
mod sidecar;
mod state;
mod build;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            // Runtime
            commands::runtime::list_installed_versions,
            commands::runtime::list_available_versions,
            commands::runtime::install_version,
            commands::runtime::uninstall_version,
            commands::runtime::switch_default_version,
            commands::runtime::get_default_version,
            // Services
            commands::service::get_all_services,
            commands::service::start_service,
            commands::service::stop_service,
            commands::service::restart_service,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
