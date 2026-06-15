use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
#[cfg(unix)]
use std::process::Command;

use tauri::State;

use crate::core::{AppError, ServiceStatus};
use crate::sidecar::manager::{cleanup_service_port_listeners, SidecarConfig};
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct ServiceInfo {
    pub id: String,
    pub name: String,
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub error: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ServiceLogSection {
    pub path: String,
    pub name: String,
    pub content: String,
    pub exists: bool,
}

fn get_service_port(id: &str) -> Option<u16> {
    if id.starts_with("nginx") {
        Some(80)
    } else if id.starts_with("mysql") {
        Some(3306)
    } else if id.starts_with("php-fpm") || id.starts_with("php-cgi") {
        Some(9000)
    } else {
        None
    }
}

fn php_fastcgi_config(runtime_dir: &Path, logs_dir: &Path, version: &str) -> SidecarConfig {
    #[cfg(target_os = "windows")]
    {
        let install_dir = runtime_dir.join("php").join(version);
        let mut env_vars = HashMap::new();
        env_vars.insert(
            "PHPRC".to_string(),
            install_dir.to_string_lossy().to_string(),
        );
        env_vars.insert("PHP_FCGI_MAX_REQUESTS".to_string(), "1000".to_string());

        return SidecarConfig {
            id: format!("php-cgi-{}", version),
            name: "PHP FastCGI".to_string(),
            binary_path: install_dir.join("php-cgi.exe"),
            args: vec!["-b".to_string(), "127.0.0.1:9000".to_string()],
            env_vars,
            working_dir: Some(install_dir),
            log_file: Some(logs_dir.join("php-cgi.log")),
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let install_dir = runtime_dir.join("php").join(version);
        let conf = install_dir.join("etc").join("php-fpm.conf");
        let mut env_vars = HashMap::new();
        env_vars.insert(
            "PHPRC".to_string(),
            install_dir.join("lib").to_string_lossy().to_string(),
        );
        env_vars.insert(
            "PHP_INI_SCAN_DIR".to_string(),
            install_dir
                .join("etc")
                .join("conf.d")
                .to_string_lossy()
                .to_string(),
        );
        SidecarConfig {
            id: format!("php-fpm-{}", version),
            name: "PHP-FPM".to_string(),
            binary_path: install_dir.join("sbin").join("php-fpm"),
            args: vec![
                "-F".to_string(),
                "-y".to_string(),
                conf.to_string_lossy().to_string(),
            ],
            env_vars,
            working_dir: None,
            log_file: Some(logs_dir.join("php-fpm.log")),
        }
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
            error: None,
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
            let binary = runtime_dir
                .join("nginx")
                .join(&version)
                .join("sbin")
                .join("nginx");
            let conf = runtime_dir
                .join("nginx")
                .join(&version)
                .join("conf")
                .join("nginx.conf");
            (
                SidecarConfig {
                    id: format!("nginx-{}", version),
                    name: "Nginx".to_string(),
                    binary_path: binary,
                    args: vec![
                        "-c".to_string(),
                        conf.to_string_lossy().to_string(),
                        "-g".to_string(),
                        "daemon off;".to_string(),
                    ],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(state.logs_dir().join("nginx.log")),
                },
                80u16,
            )
        }
        "mysql" => {
            let binary = runtime_dir
                .join("mysql")
                .join(&version)
                .join("bin")
                .join("mysqld");
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
        "php-fpm" => (
            php_fastcgi_config(&runtime_dir, &state.logs_dir(), &version),
            9000u16,
        ),
        _ => return Err(AppError::ServiceNotFound(service_type)),
    };

    ensure_port_available(&service_type, port)?;

    let mut sidecar = state.sidecar.lock().await;
    let process_info = sidecar.spawn(config).await?;

    Ok(ServiceInfo {
        id: process_info.config.id,
        name: process_info.config.name,
        status: process_info.status,
        pid: process_info.pid,
        port: Some(port),
        error: None,
    })
}

#[tauri::command]
pub async fn stop_service(state: State<'_, AppState>, service_id: String) -> Result<(), AppError> {
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
pub async fn start_all_services(state: State<'_, AppState>) -> Result<Vec<ServiceInfo>, AppError> {
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
            &"mysql" => defaults
                .get("mysql")
                .cloned()
                .unwrap_or_else(|| "8.4.3".to_string()),
            &"php-fpm" => defaults
                .get("php")
                .cloned()
                .unwrap_or_else(|| "8.4.1".to_string()),
            &"nginx" => defaults
                .get("nginx")
                .cloned()
                .unwrap_or_else(|| "1.26.2".to_string()),
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
                error: None,
            });
            drop(sidecar);
            continue;
        }
        drop(sidecar);

        // Build service config
        let (config, port) = build_service_config(service_type, &version, &runtime_dir, &logs_dir)?;
        if let Err(e) = ensure_port_available(service_type, port) {
            results.push(ServiceInfo {
                id: format!("{}-{}", service_type, version),
                name: service_type.to_string(),
                status: ServiceStatus::Error,
                pid: None,
                port: Some(port),
                error: Some(e.to_string()),
            });
            tracing::error!("Failed to start {}: {}", service_type, e);
            continue;
        }

        let mut sidecar = state.sidecar.lock().await;
        match sidecar.spawn(config).await {
            Ok(info) => {
                results.push(ServiceInfo {
                    id: info.config.id.clone(),
                    name: info.config.name.clone(),
                    status: info.status,
                    pid: info.pid,
                    port: Some(port),
                    error: None,
                });
            }
            Err(e) => {
                results.push(ServiceInfo {
                    id: format!("{}-{}", service_type, version),
                    name: service_type.to_string(),
                    status: ServiceStatus::Error,
                    pid: None,
                    port: Some(port),
                    error: Some(e.to_string()),
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
pub async fn stop_all_services(state: State<'_, AppState>) -> Result<(), AppError> {
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
            let binary = runtime_dir
                .join("nginx")
                .join(version)
                .join("sbin")
                .join("nginx");
            let conf = runtime_dir
                .join("nginx")
                .join(version)
                .join("conf")
                .join("nginx.conf");
            Ok((
                crate::sidecar::manager::SidecarConfig {
                    id: format!("nginx-{}", version),
                    name: "Nginx".to_string(),
                    binary_path: binary,
                    args: vec![
                        "-c".to_string(),
                        conf.to_string_lossy().to_string(),
                        "-g".to_string(),
                        "daemon off;".to_string(),
                    ],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(logs_dir.join("nginx.log")),
                },
                80u16,
            ))
        }
        "mysql" => {
            let binary = runtime_dir
                .join("mysql")
                .join(version)
                .join("bin")
                .join("mysqld");
            let my_cnf = runtime_dir.join("mysql").join(version).join("my.cnf");
            let _ = std::fs::create_dir_all(runtime_dir.join("mysql").join(version).join("logs"));
            Ok((
                crate::sidecar::manager::SidecarConfig {
                    id: format!("mysql-{}", version),
                    name: "MySQL".to_string(),
                    binary_path: binary,
                    args: vec![
                        format!("--defaults-file={}", my_cnf.display()),
                        "--user=root".to_string(),
                    ],
                    env_vars: HashMap::new(),
                    working_dir: None,
                    log_file: Some(logs_dir.join("mysql.log")),
                },
                3306u16,
            ))
        }
        "php-fpm" => Ok((
            php_fastcgi_config(&runtime_dir, &logs_dir, version),
            9000u16,
        )),
        _ => Err(AppError::ServiceNotFound(service_type.to_string())),
    }
}

#[tauri::command]
pub async fn get_service_log(
    state: State<'_, AppState>,
    service_type: String,
    version: String,
) -> Result<Vec<ServiceLogSection>, AppError> {
    let paths = service_log_paths(&state, &service_type, &version).await?;
    Ok(read_log_sections(&paths))
}

#[tauri::command]
pub async fn clear_service_log(
    state: State<'_, AppState>,
    service_type: String,
    version: String,
) -> Result<(), AppError> {
    let paths = service_log_paths(&state, &service_type, &version).await?;

    for path in paths {
        if path.exists() {
            std::fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .open(path)?;
        }
    }

    Ok(())
}

async fn service_log_paths(
    state: &State<'_, AppState>,
    service_type: &str,
    version: &str,
) -> Result<Vec<PathBuf>, AppError> {
    let settings = state.settings.lock().await;
    let runtime_dir = settings.get().runtime_dir.clone();
    drop(settings);

    let paths = match service_type {
        "nginx" => vec![
            state.logs_dir().join("nginx.log"),
            runtime_dir
                .join("nginx")
                .join(version)
                .join("logs")
                .join("error.log"),
            runtime_dir
                .join("nginx")
                .join(version)
                .join("logs")
                .join("access.log"),
        ],
        "php-fpm" => vec![
            #[cfg(target_os = "windows")]
            state.logs_dir().join("php-cgi.log"),
            #[cfg(not(target_os = "windows"))]
            state.logs_dir().join("php-fpm.log"),
            #[cfg(not(target_os = "windows"))]
            state.logs_dir().join("php-fpm-access.log"),
            state.logs_dir().join("php-error.log"),
        ],
        "mysql" => vec![
            state.logs_dir().join("mysql.log"),
            runtime_dir
                .join("mysql")
                .join(version)
                .join("logs")
                .join("error.log"),
        ],
        _ => return Err(AppError::ServiceNotFound(service_type.to_string())),
    };

    Ok(paths)
}

fn read_log_sections(paths: &[PathBuf]) -> Vec<ServiceLogSection> {
    let mut sections = Vec::new();

    for path in paths {
        let label = path.display().to_string();
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| label.clone());
        let exists = path.exists();
        let content = if path.exists() {
            read_log_tail(path, 64 * 1024).unwrap_or_else(|e| format!("读取失败：{}", e))
        } else {
            "日志文件不存在".to_string()
        };
        sections.push(ServiceLogSection {
            path: label,
            name,
            content: content.trim_end().to_string(),
            exists,
        });
    }

    sections
}

fn read_log_tail(path: &Path, max_bytes: u64) -> std::io::Result<String> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = std::fs::File::open(path)?;
    let len = file.metadata()?.len();
    let start = len.saturating_sub(max_bytes);
    file.seek(SeekFrom::Start(start))?;

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn ensure_port_available(service_type: &str, port: u16) -> Result<(), AppError> {
    if try_bind_service_port(service_type, port)?.is_none() {
        return Ok(());
    }

    cleanup_service_port_listeners(service_type, port);
    std::thread::sleep(std::time::Duration::from_millis(300));

    if let Some(error) = try_bind_service_port(service_type, port)? {
        return Err(error);
    }

    Ok(())
}

fn try_bind_service_port(service_type: &str, port: u16) -> Result<Option<AppError>, AppError> {
    let bind_addr = if service_type == "nginx" {
        format!("0.0.0.0:{}", port)
    } else {
        format!("127.0.0.1:{}", port)
    };

    match TcpListener::bind(&bind_addr) {
        Ok(listener) => {
            drop(listener);
            Ok(None)
        }
        Err(e) if e.kind() == ErrorKind::AddrInUse => Ok(Some(AppError::Other(format!(
            "{} 启动失败：端口 {} 已被占用。\n{}",
            service_display_name(service_type),
            port,
            port_owner_hint(port)
        )))),
        Err(e) if e.kind() == ErrorKind::PermissionDenied => Ok(Some(AppError::Other(format!(
            "{} 启动失败：没有权限监听端口 {}。可以改用更高端口，或用具备权限的方式启动。",
            service_display_name(service_type),
            port
        )))),
        Err(e) => Err(AppError::Io(e)),
    }
}

fn service_display_name(service_type: &str) -> &str {
    match service_type {
        "nginx" => "Nginx",
        #[cfg(target_os = "windows")]
        "php-fpm" => "PHP FastCGI",
        #[cfg(not(target_os = "windows"))]
        "php-fpm" => "PHP-FPM",
        "mysql" => "MySQL",
        _ => service_type,
    }
}

fn port_owner_hint(port: u16) -> String {
    #[cfg(not(unix))]
    let _ = port;

    #[cfg(unix)]
    {
        match Command::new("lsof")
            .args(["-nP", &format!("-iTCP:{}", port), "-sTCP:LISTEN"])
            .output()
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout.is_empty() {
                    "请先停止占用该端口的进程后再启动。".to_string()
                } else {
                    format!("当前监听进程：\n{}", stdout)
                }
            }
            _ => "请先停止占用该端口的进程后再启动。".to_string(),
        }
    }

    #[cfg(not(unix))]
    {
        "请先停止占用该端口的进程后再启动。".to_string()
    }
}
