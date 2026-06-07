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
use tauri::Manager;

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
            // PHP Config
            commands::php_config::get_php_config,
            commands::php_config::save_php_config,
            commands::php_config::list_php_extensions,
            commands::php_config::toggle_php_extension,
            commands::php_config::get_php_fpm_config,
            commands::php_config::save_php_fpm_config,
            commands::php_config::list_pecl_extensions,
            commands::php_config::install_pecl_extension,
            // MySQL Config
            commands::mysql_config::get_mysql_config,
            commands::mysql_config::save_mysql_config,
            commands::mysql_config::list_mysql_users,
            commands::mysql_config::create_mysql_user,
            commands::mysql_config::drop_mysql_user,
            commands::mysql_config::change_mysql_password,
            commands::mysql_config::list_mysql_databases,
            commands::mysql_config::create_mysql_database,
            commands::mysql_config::drop_mysql_database,
            // Nginx Config
            commands::nginx_config::get_nginx_config,
            commands::nginx_config::save_nginx_config,
            commands::nginx_config::reload_nginx,
            commands::nginx_config::list_vhosts,
            commands::nginx_config::create_vhost,
            commands::nginx_config::delete_vhost,
            commands::nginx_config::get_hosts_content,
            commands::nginx_config::add_hosts_entry,
            commands::nginx_config::remove_hosts_entry,
        ])
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                // Gracefully stop all managed services
                let handle = tokio::runtime::Handle::current();
                let _ = handle.block_on(async {
                    if let Some(state) = _app.try_state::<AppState>() {
                        let mut sidecar = state.sidecar.lock().await;
                        sidecar.shutdown_all().await;
                    }
                });
            }
        });
}
