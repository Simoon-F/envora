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
