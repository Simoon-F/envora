use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum EventPayload {
    #[serde(rename = "download_progress")]
    DownloadProgress {
        runtime: String,
        version: String,
        percent: f64,
        downloaded_bytes: u64,
        total_bytes: u64,
    },

    #[serde(rename = "build_progress")]
    BuildProgress {
        runtime: String,
        version: String,
        stage: BuildStage,
        message: String,
        percent: f64,
    },

    #[serde(rename = "status_change")]
    StatusChange {
        service: String,
        status: ServiceStatus,
    },

    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildStage {
    Downloading,
    Extracting,
    Configuring,
    Compiling,
    Installing,
    PostInstall,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatus {
    Running,
    Stopped,
    Error,
    Starting,
    Stopping,
    Unknown,
}

/// Emit a progress event to the frontend
pub fn emit_progress(app: &tauri::AppHandle, event: &EventPayload) {
    use tauri::Emitter;
    let _ = app.emit("envora://progress", event);
}
