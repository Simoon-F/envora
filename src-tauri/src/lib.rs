#![allow(dead_code)]

mod build;
mod commands;
mod core;
mod download;
mod runtime;
mod settings;
mod sidecar;
mod state;

use crate::core::ServiceStatus;
use crate::sidecar::manager::cleanup_envora_runtime_processes;
use state::AppState;
use tauri::{Emitter, Manager};

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
        // ── Window close → hide to tray ──────────────────────────
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_shell_environment_status,
            commands::settings::install_shell_environment,
            // Runtime
            commands::runtime::list_installed_versions,
            commands::runtime::list_available_versions,
            commands::runtime::install_version,
            commands::runtime::start_runtime_install,
            commands::runtime::list_operations,
            commands::runtime::clear_operation,
            commands::runtime::uninstall_version,
            commands::runtime::switch_default_version,
            commands::runtime::get_default_version,
            commands::runtime::get_node_package_manager_status,
            commands::runtime::set_corepack_enabled,
            commands::runtime::install_node_package_manager,
            commands::runtime::install_project_package_manager,
            commands::runtime::get_go_env_status,
            commands::runtime::update_go_env,
            commands::runtime::apply_go_managed_paths,
            commands::runtime::get_go_tools_status,
            commands::runtime::install_go_tool,
            commands::runtime::get_go_cache_status,
            commands::runtime::clear_go_cache,
            commands::runtime::repair_go_sdk,
            // Services
            commands::service::get_all_services,
            commands::service::start_service,
            commands::service::stop_service,
            commands::service::restart_service,
            commands::service::start_all_services,
            commands::service::stop_all_services,
            commands::service::get_service_log,
            commands::service::clear_service_log,
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
            commands::nginx_config::get_vhost_config,
            commands::nginx_config::save_vhost_config,
            commands::nginx_config::get_hosts_content,
            commands::nginx_config::add_hosts_entry,
            commands::nginx_config::remove_hosts_entry,
            // Composer
            commands::composer::get_composer_info,
            commands::composer::install_composer,
            commands::composer::update_composer,
            commands::composer::get_composer_config,
            commands::composer::set_composer_config,
            commands::composer::run_composer_command,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // ── Adopt already-running Envora runtimes ───────────
            if let Some(state) = app.try_state::<AppState>() {
                let adopted = tauri::async_runtime::block_on(async {
                    let settings = state.settings.lock().await;
                    let runtime_dir = settings.get().runtime_dir.clone();
                    let defaults = settings.get().default_versions.clone();
                    let logs_dir = state.logs_dir();
                    drop(settings);

                    let mut sidecar = state.sidecar.lock().await;
                    sidecar.adopt_existing_envora_processes(&runtime_dir, &logs_dir, &defaults)
                });

                if adopted > 0 {
                    tracing::info!("Adopted {} existing Envora runtime process(es)", adopted);
                }
            }

            // ── System Tray ──────────────────────────────────────
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show_item = MenuItemBuilder::with_id("show", "Show Envora").build(app)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&separator)
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Envora")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| {
                    // macOS: left-click tray icon toggles window
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // ── Health check ─────────────────────────────────────
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

                    if let Some(state) = handle.try_state::<AppState>() {
                        let mut sidecar = state.sidecar.lock().await;
                        let changed = sidecar.health_check_all();

                        for info in changed {
                            let _ = handle.emit(
                                "envora://service-status",
                                serde_json::json!({
                                    "id": info.config.id,
                                    "name": info.config.name,
                                    "status": ServiceStatus::Stopped,
                                    "pid": null,
                                }),
                            );
                        }
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = tauri::async_runtime::block_on(async {
                    if let Some(state) = _app.try_state::<AppState>() {
                        let mut sidecar = state.sidecar.lock().await;
                        sidecar.shutdown_all().await;
                        cleanup_envora_runtime_processes(&state.data_dir);
                    }
                });
            }
        });
}
