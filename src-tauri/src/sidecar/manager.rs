use std::collections::HashMap;
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
            let mut args = vec!["/PID", &pid.to_string()];
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
