use std::collections::HashMap;

use tauri::State;

use crate::core::{AppError, ServiceStatus};
use crate::sidecar::manager::SidecarConfig;
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct ServiceInfo {
    pub id: String,
    pub name: String,
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub port: Option<u16>,
}

fn get_service_port(id: &str) -> Option<u16> {
    match id {
        "nginx" => Some(80),
        "mysql" => Some(3306),
        "php-fpm" => Some(9000),
        _ => None,
    }
}

#[tauri::command]
pub async fn get_all_services(state: State<'_, AppState>) -> Result<Vec<ServiceInfo>, AppError> {
    let sidecar = state.sidecar.lock().await;
    let processes = sidecar.get_all_processes();

    let services = processes
        .iter()
        .map(|p| ServiceInfo {
            id: p.config.id.clone(),
            name: p.config.name.clone(),
            status: p.status.clone(),
            pid: p.pid,
            port: get_service_port(&p.config.id),
        })
        .collect();

    Ok(services)
}

#[tauri::command]
pub async fn start_service(
    state: State<'_, AppState>,
    service_type: String,
    version: String,
) -> Result<ServiceInfo, AppError> {
    let settings = state.settings.lock().await;
    let runtime_dir = settings.get().runtime_dir.clone();
    drop(settings);

    let (config, port) = match service_type.as_str() {
        "nginx" => {
            let binary = runtime_dir.join("nginx").join(&version).join("sbin").join("nginx");
            let conf = runtime_dir.join("nginx").join(&version).join("conf").join("nginx.conf");
            (
                SidecarConfig {
                    id: format!("nginx-{}", version),
                    name: "Nginx".to_string(),
                    binary_path: binary,
                    args: vec!["-c".to_string(), conf.to_string_lossy().to_string()],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(state.logs_dir().join("nginx.log")),
                },
                80u16,
            )
        }
        "mysql" => {
            let binary = runtime_dir.join("mysql").join(&version).join("bin").join("mysqld");
            let my_cnf = runtime_dir.join("mysql").join(&version).join("my.cnf");
            // Ensure logs dir exists (MySQL refuses to start without it)
            let _ = std::fs::create_dir_all(runtime_dir.join("mysql").join(&version).join("logs"));
            (
                SidecarConfig {
                    id: format!("mysql-{}", version),
                    name: "MySQL".to_string(),
                    binary_path: binary,
                    args: vec![
                        format!("--defaults-file={}", my_cnf.display()),
                        "--user=root".to_string(),
                    ],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(state.logs_dir().join("mysql.log")),
                },
                3306u16,
            )
        }
        "php-fpm" => {
            let binary = runtime_dir.join("php").join(&version).join("sbin").join("php-fpm");
            let conf = runtime_dir.join("php").join(&version).join("etc").join("php-fpm.conf");
            (
                SidecarConfig {
                    id: format!("php-fpm-{}", version),
                    name: "PHP-FPM".to_string(),
                    binary_path: binary,
                    args: vec!["--fpm-config".to_string(), conf.to_string_lossy().to_string()],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(state.logs_dir().join("php-fpm.log")),
                },
                9000u16,
            )
        }
        _ => return Err(AppError::ServiceNotFound(service_type)),
    };

    let mut sidecar = state.sidecar.lock().await;
    let process_info = sidecar.spawn(config).await?;

    Ok(ServiceInfo {
        id: process_info.config.id,
        name: process_info.config.name,
        status: process_info.status,
        pid: process_info.pid,
        port: Some(port),
    })
}

#[tauri::command]
pub async fn stop_service(
    state: State<'_, AppState>,
    service_id: String,
) -> Result<(), AppError> {
    let mut sidecar = state.sidecar.lock().await;

    // Find process by service type prefix
    let uuid = sidecar
        .get_by_type(&service_id)
        .first()
        .map(|p| p.uuid.clone())
        .ok_or_else(|| AppError::ServiceNotFound(service_id))?;

    sidecar.stop(&uuid, false).await
}

#[tauri::command]
pub async fn restart_service(
    state: State<'_, AppState>,
    service_id: String,
) -> Result<(), AppError> {
    let mut sidecar = state.sidecar.lock().await;

    let uuid = sidecar
        .get_by_type(&service_id)
        .first()
        .map(|p| p.uuid.clone())
        .ok_or_else(|| AppError::ServiceNotFound(service_id))?;

    sidecar.restart(&uuid).await
}

// ── Start All / Stop All ───────────────────────────────────────────

#[tauri::command]
pub async fn start_all_services(
    state: State<'_, AppState>,
) -> Result<Vec<ServiceInfo>, AppError> {
    let mut results = Vec::new();
    let settings = state.settings.lock().await;
    let runtime_dir = settings.get().runtime_dir.clone();
    let logs_dir = state.logs_dir().clone();
    let defaults = settings.get().default_versions.clone();
    drop(settings);

    // Start order: MySQL → PHP-FPM → Nginx
    let order = ["mysql", "php-fpm", "nginx"];

    for service_type in &order {
        let version = match service_type {
            &"mysql" => defaults.get("mysql").cloned().unwrap_or_else(|| "8.4.3".to_string()),
            &"php-fpm" => defaults.get("php").cloned().unwrap_or_else(|| "8.4.1".to_string()),
            &"nginx" => defaults.get("nginx").cloned().unwrap_or_else(|| "1.26.2".to_string()),
            _ => continue,
        };

        // Skip if already running
        let sidecar = state.sidecar.lock().await;
        let existing = sidecar.get_by_type(service_type);
        if existing.iter().any(|p| p.status == ServiceStatus::Running) {
            results.push(ServiceInfo {
                id: existing[0].config.id.clone(),
                name: existing[0].config.name.clone(),
                status: ServiceStatus::Running,
                pid: existing[0].pid,
                port: get_service_port(service_type),
            });
            drop(sidecar);
            continue;
        }
        drop(sidecar);

        // Build service config
        let (config, port) = build_service_config(service_type, &version, &runtime_dir, &logs_dir)?;
        let mut sidecar = state.sidecar.lock().await;
        match sidecar.spawn(config).await {
            Ok(info) => {
                results.push(ServiceInfo {
                    id: info.config.id.clone(),
                    name: info.config.name.clone(),
                    status: info.status,
                    pid: info.pid,
                    port: Some(port),
                });
            }
            Err(e) => {
                results.push(ServiceInfo {
                    id: format!("{}-{}", service_type, version),
                    name: service_type.to_string(),
                    status: ServiceStatus::Error,
                    pid: None,
                    port: Some(port),
                });
                tracing::error!("Failed to start {}: {}", service_type, e);
            }
        }
        // Small delay between service starts
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
    }

    Ok(results)
}

#[tauri::command]
pub async fn stop_all_services(
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut sidecar = state.sidecar.lock().await;

    // Stop order: Nginx → PHP-FPM → MySQL (reverse)
    for service_type in &["nginx", "php-fpm", "mysql"] {
        sidecar.stop_by_type(service_type).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }

    Ok(())
}

fn build_service_config(
    service_type: &str,
    version: &str,
    runtime_dir: &std::path::Path,
    logs_dir: &std::path::Path,
) -> Result<(crate::sidecar::manager::SidecarConfig, u16), AppError> {
    match service_type {
        "nginx" => {
            let binary = runtime_dir.join("nginx").join(version).join("sbin").join("nginx");
            let conf = runtime_dir.join("nginx").join(version).join("conf").join("nginx.conf");
            Ok((
                crate::sidecar::manager::SidecarConfig {
                    id: format!("nginx-{}", version),
                    name: "Nginx".to_string(),
                    binary_path: binary,
                    args: vec!["-c".to_string(), conf.to_string_lossy().to_string()],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(logs_dir.join("nginx.log")),
                },
                80u16,
            ))
        }
        "mysql" => {
            let binary = runtime_dir.join("mysql").join(version).join("bin").join("mysqld");
            let my_cnf = runtime_dir.join("mysql").join(version).join("my.cnf");
            let _ = std::fs::create_dir_all(runtime_dir.join("mysql").join(version).join("logs"));
            Ok((
                crate::sidecar::manager::SidecarConfig {
                    id: format!("mysql-{}", version),
                    name: "MySQL".to_string(),
                    binary_path: binary,
                    args: vec![format!("--defaults-file={}", my_cnf.display()), "--user=root".to_string()],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(logs_dir.join("mysql.log")),
                },
                3306u16,
            ))
        }
        "php-fpm" => {
            let binary = runtime_dir.join("php").join(version).join("sbin").join("php-fpm");
            let conf = runtime_dir.join("php").join(version).join("etc").join("php-fpm.conf");
            Ok((
                crate::sidecar::manager::SidecarConfig {
                    id: format!("php-fpm-{}", version),
                    name: "PHP-FPM".to_string(),
                    binary_path: binary,
                    args: vec!["-y".to_string(), conf.to_string_lossy().to_string()],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(logs_dir.join("php-fpm.log")),
                },
                9000u16,
            ))
        }
        _ => Err(AppError::ServiceNotFound(service_type.to_string())),
    }
}
