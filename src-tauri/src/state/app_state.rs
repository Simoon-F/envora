use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::settings::manager::SettingsManager;
use crate::sidecar::manager::SidecarManager;
use crate::state::operations::OperationManager;

/// Application state shared across all Tauri commands
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Mutex<SettingsManager>>,
    pub sidecar: Arc<Mutex<SidecarManager>>,
    pub operations: Arc<Mutex<OperationManager>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new() -> Self {
        let data_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".envora");

        // Ensure directories exist
        let runtimes_dir = data_dir.join("runtimes");
        let bin_dir = data_dir.join("bin");
        let config_dir = data_dir.join("config");
        let logs_dir = data_dir.join("logs");

        for dir in [&runtimes_dir, &bin_dir, &config_dir, &logs_dir] {
            let _ = std::fs::create_dir_all(dir);
        }

        let settings = SettingsManager::new(&config_dir);
        let sidecar = SidecarManager::new();
        let operations = OperationManager::default();

        Self {
            settings: Arc::new(Mutex::new(settings)),
            sidecar: Arc::new(Mutex::new(sidecar)),
            operations: Arc::new(Mutex::new(operations)),
            data_dir,
        }
    }

    pub fn runtimes_dir(&self) -> PathBuf {
        self.data_dir.join("runtimes")
    }

    pub fn bin_dir(&self) -> PathBuf {
        self.data_dir.join("bin")
    }

    pub fn config_dir(&self) -> PathBuf {
        self.data_dir.join("config")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.data_dir.join("logs")
    }
}
