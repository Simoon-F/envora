use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::core::{AppError, ServiceStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarConfig {
    pub id: String,
    pub name: String,
    pub binary_path: PathBuf,
    pub args: Vec<String>,
    pub env_vars: HashMap<String, String>,
    pub working_dir: Option<PathBuf>,
    pub log_file: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub uuid: String,
    pub config: SidecarConfig,
    pub pid: Option<u32>,
    pub status: ServiceStatus,
    pub started_at: Option<String>,
}

pub struct SidecarManager {
    processes: HashMap<String, ProcessInfo>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
        }
    }

    /// Adopt already-running Envora runtime processes after the app restarts.
    pub fn adopt_existing_envora_processes(
        &mut self,
        runtime_dir: &Path,
        logs_dir: &Path,
        default_versions: &HashMap<String, String>,
    ) -> usize {
        #[cfg(not(unix))]
        {
            let _ = (runtime_dir, logs_dir, default_versions);
            0
        }

        #[cfg(unix)]
        {
            let output = match std::process::Command::new("ps")
                .args(["-axo", "pid=,command="])
                .output()
            {
                Ok(output) => output,
                Err(error) => {
                    tracing::warn!("Unable to scan existing Envora processes: {}", error);
                    return 0;
                }
            };

            let current_pid = std::process::id();
            let runtime_dir_text = runtime_dir.display().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut by_service: HashMap<(String, String), AdoptedRuntimeProcess> = HashMap::new();

            for line in stdout.lines() {
                if let Some(process) =
                    parse_adoptable_envora_process(line, &runtime_dir_text, current_pid)
                {
                    let key = (process.service_type.clone(), process.version.clone());
                    by_service
                        .entry(key)
                        .and_modify(|existing| {
                            if process.pid < existing.pid || process.is_master {
                                *existing = process.clone();
                            }
                        })
                        .or_insert(process);
                }
            }

            let mut adopted = 0;
            for process in by_service.values() {
                if self
                    .processes
                    .values()
                    .any(|p| p.config.id == process.service_id())
                {
                    continue;
                }

                if let Some(config) =
                    adopted_runtime_config(process, runtime_dir, logs_dir, default_versions)
                {
                    let uuid = uuid::Uuid::new_v4().to_string();
                    self.processes.insert(
                        uuid.clone(),
                        ProcessInfo {
                            uuid,
                            config,
                            pid: Some(process.pid),
                            status: ServiceStatus::Running,
                            started_at: Some(chrono::Local::now().to_rfc3339()),
                        },
                    );
                    adopted += 1;
                }
            }

            adopted
        }
    }

    /// Spawn a new sidecar process
    pub async fn spawn(&mut self, config: SidecarConfig) -> Result<ProcessInfo, AppError> {
        let uuid = uuid::Uuid::new_v4().to_string();

        let mut cmd = Command::new(&config.binary_path);
        cmd.args(&config.args);

        for (key, value) in &config.env_vars {
            cmd.env(key, value);
        }

        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }

        // Redirect stdout/stderr to log file if specified
        if let Some(ref log_path) = config.log_file {
            if let Some(parent) = log_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let log_file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)?;
            cmd.stdout(Stdio::from(log_file.try_clone()?));
            cmd.stderr(Stdio::from(log_file));
        } else {
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
        }

        let mut child = cmd.spawn()?;

        let pid = child.id();

        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        if let Some(status) = child.try_wait()? {
            return Err(AppError::Other(format!(
                "{} exited immediately with status {}",
                config.name, status
            )));
        }

        let info = ProcessInfo {
            uuid: uuid.clone(),
            config,
            pid,
            status: ServiceStatus::Running,
            started_at: Some(chrono::Local::now().to_rfc3339()),
        };

        self.processes.insert(uuid.clone(), info.clone());

        // Detach the child process (we don't hold the handle)
        tokio::spawn(async move {
            let _ = child.wait().await;
        });

        Ok(info)
    }

    /// Stop a process by UUID
    pub async fn stop(&mut self, uuid: &str, force: bool) -> Result<(), AppError> {
        let info = self
            .processes
            .get(uuid)
            .ok_or_else(|| AppError::ProcessNotFound(uuid.to_string()))?;

        let pid = info
            .pid
            .ok_or_else(|| AppError::ProcessNotFound("No PID".to_string()))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{self, Signal};
            use nix::unistd::Pid;

            let signal = if force {
                Signal::SIGKILL
            } else {
                Signal::SIGTERM
            };

            signal::kill(Pid::from_raw(pid as i32), signal)
                .map_err(|e| AppError::Other(format!("Failed to send signal: {}", e)))?;
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, we use taskkill
            let pid_arg = pid.to_string();
            let mut args = vec!["/PID", pid_arg.as_str()];
            if force {
                args.push("/F");
            }
            let output = std::process::Command::new("taskkill")
                .args(&args)
                .output()?;

            if !output.status.success() {
                return Err(AppError::Other(format!(
                    "Failed to kill process: {}",
                    String::from_utf8_lossy(&output.stderr)
                )));
            }
        }

        if let Some(info) = self.processes.get_mut(uuid) {
            info.status = ServiceStatus::Stopped;
        }

        Ok(())
    }

    /// Restart a process
    pub async fn restart(&mut self, uuid: &str) -> Result<(), AppError> {
        let config = self
            .processes
            .get(uuid)
            .map(|info| info.config.clone())
            .ok_or_else(|| AppError::ProcessNotFound(uuid.to_string()))?;

        let _ = self.stop(uuid, false).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Remove old entry
        self.processes.remove(uuid);

        // Spawn new process with same config
        let mut new_info = self.spawn(config).await?;

        // Update the UUID to maintain consistency
        new_info.uuid = uuid.to_string();
        self.processes.insert(uuid.to_string(), new_info);

        Ok(())
    }

    /// Check if a process is still alive
    pub fn health_check(&self, uuid: &str) -> Result<ServiceStatus, AppError> {
        let info = self
            .processes
            .get(uuid)
            .ok_or_else(|| AppError::ProcessNotFound(uuid.to_string()))?;

        if let Some(pid) = info.pid {
            let alive = is_process_alive(pid);
            Ok(if alive {
                ServiceStatus::Running
            } else {
                ServiceStatus::Stopped
            })
        } else {
            Ok(ServiceStatus::Unknown)
        }
    }

    /// Get info about a process
    pub fn get_process(&self, uuid: &str) -> Option<&ProcessInfo> {
        self.processes.get(uuid)
    }

    /// Get all processes
    pub fn get_all_processes(&self) -> Vec<&ProcessInfo> {
        self.processes.values().collect()
    }

    /// Get processes by type (id prefix)
    pub fn get_by_type(&self, service_type: &str) -> Vec<&ProcessInfo> {
        self.processes
            .values()
            .filter(|p| p.config.id.starts_with(service_type))
            .collect()
    }

    /// Shutdown all managed processes
    pub async fn shutdown_all(&mut self) {
        let uuids: Vec<String> = self.processes.keys().cloned().collect();
        for uuid in uuids {
            let _ = self.stop(&uuid, true).await;
        }
        self.processes.clear();
    }

    /// Stop all processes matching a type prefix (e.g., "nginx")
    pub async fn stop_by_type(&mut self, service_type: &str) {
        let uuids: Vec<String> = self
            .processes
            .values()
            .filter(|p| p.config.id.starts_with(service_type))
            .map(|p| p.uuid.clone())
            .collect();
        for uuid in uuids {
            let _ = self.stop(&uuid, true).await;
        }
    }

    /// Check health of all managed processes and return status changes
    pub fn health_check_all(&mut self) -> Vec<ProcessInfo> {
        let mut changed = Vec::new();
        let uuids: Vec<String> = self.processes.keys().cloned().collect();

        for uuid in &uuids {
            let was_running = self
                .processes
                .get(uuid)
                .map(|p| p.status == ServiceStatus::Running)
                .unwrap_or(false);

            let alive = self
                .processes
                .get(uuid)
                .and_then(|p| p.pid)
                .map(is_process_alive)
                .unwrap_or(false);

            if was_running && !alive {
                if let Some(info) = self.processes.get_mut(uuid) {
                    info.status = ServiceStatus::Stopped;
                    info.pid = None;
                    changed.push(info.clone());
                }
            }
        }

        // Remove dead entries (optional: keep them as "stopped")
        self.processes.retain(|_, info| {
            info.status == ServiceStatus::Running || info.pid.map(is_process_alive).unwrap_or(false)
        });

        changed
    }
}

/// Stop Envora runtime processes that detached from the in-memory manager.
pub fn cleanup_envora_runtime_processes(data_dir: &Path) {
    #[cfg(not(unix))]
    let _ = data_dir;

    #[cfg(unix)]
    {
        let runtimes_dir = data_dir.join("runtimes").display().to_string();
        let output = match std::process::Command::new("ps")
            .args(["-axo", "pid=,command="])
            .output()
        {
            Ok(output) => output,
            Err(error) => {
                tracing::warn!("Unable to scan Envora runtime processes: {}", error);
                return;
            }
        };

        let current_pid = std::process::id();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let pids: Vec<u32> = stdout
            .lines()
            .filter_map(|line| parse_envora_runtime_pid(line, &runtimes_dir, current_pid))
            .collect();

        for pid in &pids {
            send_signal(*pid, false);
        }

        std::thread::sleep(std::time::Duration::from_millis(800));

        for pid in pids {
            if is_process_alive(pid) {
                send_signal(pid, true);
            }
        }
    }
}

/// Stop orphaned same-service listeners that can remain after a daemonized process lost its master.
pub fn cleanup_service_port_listeners(service_type: &str, port: u16) {
    #[cfg(unix)]
    {
        let output = match std::process::Command::new("lsof")
            .args([
                "-nP",
                &format!("-iTCP:{}", port),
                "-sTCP:LISTEN",
                "-F",
                "pc",
            ])
            .output()
        {
            Ok(output) => output,
            Err(error) => {
                tracing::warn!("Unable to scan port {} listeners: {}", port, error);
                return;
            }
        };

        let current_user = whoami::username();
        let pids = parse_same_service_lsof_pids(
            &String::from_utf8_lossy(&output.stdout),
            service_type,
            &current_user,
        );

        for pid in &pids {
            send_signal(*pid, false);
        }

        std::thread::sleep(std::time::Duration::from_millis(500));

        for pid in pids {
            if is_process_alive(pid) {
                send_signal(pid, true);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let expected_process = match service_type {
            "nginx" => "nginx.exe",
            "php-fpm" => "php-cgi.exe",
            "mysql" => "mysqld.exe",
            _ => return,
        };

        let pids = windows_same_service_listener_pids(port, expected_process);
        for pid in &pids {
            stop_windows_process(*pid, false);
        }

        std::thread::sleep(std::time::Duration::from_millis(500));

        for pid in pids {
            if is_process_alive(pid) {
                stop_windows_process(pid, true);
            }
        }
    }

    #[cfg(not(any(unix, target_os = "windows")))]
    {
        let _ = (service_type, port);
    }
}

#[cfg(target_os = "windows")]
fn windows_same_service_listener_pids(port: u16, expected_process: &str) -> Vec<u32> {
    windows_listener_pids(port)
        .into_iter()
        .filter(|pid| {
            windows_process_name(*pid)
                .map(|name| name.eq_ignore_ascii_case(expected_process))
                .unwrap_or(false)
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn windows_listener_pids(port: u16) -> Vec<u32> {
    let output = std::process::Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output();
    let stdout = match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).to_string()
        }
        _ => return Vec::new(),
    };
    let port_suffix = format!(":{}", port);

    stdout
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 5 || parts[0] != "TCP" {
                return None;
            }

            let local_addr = parts[1];
            let state = parts[3];
            let pid = parts[4];

            if local_addr.ends_with(&port_suffix) && state.eq_ignore_ascii_case("LISTENING") {
                pid.parse::<u32>().ok()
            } else {
                None
            }
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn windows_process_name(pid: u32) -> Option<String> {
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .find(|line| line.contains(&pid.to_string()))?;
    line.split(',')
        .next()
        .map(|name| name.trim_matches('"').to_string())
        .filter(|name| !name.is_empty())
}

#[cfg(target_os = "windows")]
fn stop_windows_process(pid: u32, force: bool) {
    let pid_arg = pid.to_string();
    let mut args = vec!["/PID", pid_arg.as_str()];
    if force {
        args.push("/F");
    }

    match std::process::Command::new("taskkill").args(&args).output() {
        Ok(output) if output.status.success() => {}
        Ok(output) => tracing::warn!(
            "Failed to stop Windows process {}: {}",
            pid,
            String::from_utf8_lossy(&output.stderr)
        ),
        Err(error) => tracing::warn!("Failed to stop Windows process {}: {}", pid, error),
    }
}

#[cfg(unix)]
fn parse_same_service_lsof_pids(output: &str, service_type: &str, current_user: &str) -> Vec<u32> {
    let expected_command = match service_type {
        "nginx" => "nginx",
        "php-fpm" => "php-fpm",
        "mysql" => "mysqld",
        _ => return Vec::new(),
    };

    let mut pids = Vec::new();
    let mut current_pid = None;
    let mut current_command = String::new();
    let mut current_owner = String::new();

    for line in output.lines() {
        if let Some(pid) = line.strip_prefix('p') {
            if should_stop_lsof_entry(
                current_pid,
                &current_command,
                &current_owner,
                expected_command,
                current_user,
            ) {
                if let Some(pid) = current_pid {
                    pids.push(pid);
                }
            }

            current_pid = pid.parse::<u32>().ok();
            current_command.clear();
            current_owner.clear();
        } else if let Some(command) = line.strip_prefix('c') {
            current_command = command.to_string();
        } else if let Some(owner) = line.strip_prefix('u') {
            current_owner = owner.to_string();
        }
    }

    if should_stop_lsof_entry(
        current_pid,
        &current_command,
        &current_owner,
        expected_command,
        current_user,
    ) {
        if let Some(pid) = current_pid {
            pids.push(pid);
        }
    }

    pids
}

#[cfg(unix)]
fn should_stop_lsof_entry(
    pid: Option<u32>,
    command: &str,
    owner: &str,
    expected_command: &str,
    current_user: &str,
) -> bool {
    pid.is_some() && command == expected_command && (owner == current_user || owner.is_empty())
}

#[derive(Clone)]
struct AdoptedRuntimeProcess {
    pid: u32,
    service_type: String,
    version: String,
    is_master: bool,
}

impl AdoptedRuntimeProcess {
    fn service_id(&self) -> String {
        match self.service_type.as_str() {
            "php-fpm" => format!("php-fpm-{}", self.version),
            service_type => format!("{}-{}", service_type, self.version),
        }
    }
}

#[cfg(unix)]
fn parse_adoptable_envora_process(
    line: &str,
    runtime_dir: &str,
    current_pid: u32,
) -> Option<AdoptedRuntimeProcess> {
    let trimmed = line.trim_start();
    let (pid_text, command) = trimmed.split_once(char::is_whitespace)?;
    let pid = pid_text.parse::<u32>().ok()?;

    if pid == current_pid || !command.contains(runtime_dir) {
        return None;
    }

    for (service_type, dir_name) in [("nginx", "nginx"), ("php-fpm", "php"), ("mysql", "mysql")] {
        let marker = format!("{}/{}/", runtime_dir, dir_name);
        if let Some(version) = version_after_marker(command, &marker) {
            return Some(AdoptedRuntimeProcess {
                pid,
                service_type: service_type.to_string(),
                version,
                is_master: command.contains("master process"),
            });
        }
    }

    None
}

#[cfg(unix)]
fn version_after_marker(command: &str, marker: &str) -> Option<String> {
    let start = command.find(marker)? + marker.len();
    let rest = &command[start..];
    let version = rest
        .split(|ch: char| ch == '/' || ch.is_whitespace())
        .next()?
        .trim();

    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

fn adopted_runtime_config(
    process: &AdoptedRuntimeProcess,
    runtime_dir: &Path,
    logs_dir: &Path,
    _default_versions: &HashMap<String, String>,
) -> Option<SidecarConfig> {
    match process.service_type.as_str() {
        "nginx" => {
            let version = process.version.clone();
            let install_dir = runtime_dir.join("nginx").join(&version);
            let conf = install_dir.join("conf").join("nginx.conf");
            Some(SidecarConfig {
                id: format!("nginx-{}", version),
                name: "Nginx".to_string(),
                binary_path: install_dir.join("sbin").join("nginx"),
                args: vec![
                    "-c".to_string(),
                    conf.to_string_lossy().to_string(),
                    "-g".to_string(),
                    "daemon off;".to_string(),
                ],
                env_vars: HashMap::new(),
                working_dir: None,
                log_file: Some(logs_dir.join("nginx.log")),
            })
        }
        "php-fpm" => {
            let version = process.version.clone();
            let install_dir = runtime_dir.join("php").join(&version);
            let conf = install_dir.join("etc").join("php-fpm.conf");
            Some(SidecarConfig {
                id: format!("php-fpm-{}", version),
                name: "PHP-FPM".to_string(),
                binary_path: install_dir.join("sbin").join("php-fpm"),
                args: vec![
                    "-F".to_string(),
                    "-y".to_string(),
                    conf.to_string_lossy().to_string(),
                ],
                env_vars: HashMap::new(),
                working_dir: None,
                log_file: Some(logs_dir.join("php-fpm.log")),
            })
        }
        "mysql" => {
            let version = process.version.clone();
            let install_dir = runtime_dir.join("mysql").join(&version);
            Some(SidecarConfig {
                id: format!("mysql-{}", version),
                name: "MySQL".to_string(),
                binary_path: install_dir.join("bin").join("mysqld"),
                args: vec![
                    format!("--defaults-file={}", install_dir.join("my.cnf").display()),
                    "--user=root".to_string(),
                ],
                env_vars: HashMap::new(),
                working_dir: None,
                log_file: Some(logs_dir.join("mysql.log")),
            })
        }
        _ => None,
    }
}

#[cfg(unix)]
fn parse_envora_runtime_pid(line: &str, runtimes_dir: &str, current_pid: u32) -> Option<u32> {
    let trimmed = line.trim_start();
    let (pid_text, command) = trimmed.split_once(char::is_whitespace)?;
    let pid = pid_text.parse::<u32>().ok()?;

    if pid == current_pid || !command.contains(runtimes_dir) {
        return None;
    }

    let is_envora_runtime =
        command.contains("/nginx/") || command.contains("/php/") || command.contains("/mysql/");
    if is_envora_runtime {
        Some(pid)
    } else {
        None
    }
}

#[cfg(unix)]
fn send_signal(pid: u32, force: bool) {
    use nix::sys::signal::{self, Signal};
    use nix::unistd::Pid;

    let signal = if force {
        Signal::SIGKILL
    } else {
        Signal::SIGTERM
    };

    if let Err(error) = signal::kill(Pid::from_raw(pid as i32), signal) {
        tracing::warn!("Failed to stop Envora runtime process {}: {}", pid, error);
    }
}

/// Check if a process is alive by PID
pub fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        use nix::sys::signal;
        use nix::unistd::Pid;

        signal::kill(Pid::from_raw(pid as i32), None).is_ok()
    }

    #[cfg(not(unix))]
    {
        // Fallback: try to kill with signal 0 (doesn't actually kill)
        // On Windows, use a different approach
        let output = std::process::Command::new("tasklist")
            .args([r"/FI", &format!("PID eq {}", pid), r"/NH"])
            .output();

        match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                stdout.contains(&pid.to_string())
            }
            Err(_) => false,
        }
    }
}
