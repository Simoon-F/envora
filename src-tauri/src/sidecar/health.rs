use std::sync::Arc;

use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

use super::manager::SidecarManager;
use crate::core::{EventPayload, ServiceStatus};

/// Health checker that runs in the background
pub struct HealthChecker {
    interval_secs: u64,
}

impl HealthChecker {
    pub fn new(interval_secs: u64) -> Self {
        Self { interval_secs }
    }

    /// Start the health checker background task
    pub fn start(
        self,
        sidecar: Arc<Mutex<SidecarManager>>,
        app_handle: tauri::AppHandle,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(self.interval_secs));

            loop {
                ticker.tick().await;

                let sidecar = sidecar.lock().await;
                let processes = sidecar.get_all_processes();

                for process in processes {
                    if let Ok(status) = sidecar.health_check(&process.uuid) {
                        if status != ServiceStatus::Running
                            && process.status == ServiceStatus::Running
                        {
                            // Process died unexpectedly
                            let _ = app_handle.emit(
                                "envora://progress",
                                EventPayload::StatusChange {
                                    service: process.config.id.clone(),
                                    status: ServiceStatus::Stopped,
                                },
                            );
                        }
                    }
                }
            }
        })
    }
}
