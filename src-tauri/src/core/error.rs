use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Download failed: {0}")]
    Download(String),

    #[error("Build failed: {0}")]
    Build(String),

    #[error("Process not found: {0}")]
    ProcessNotFound(String),

    #[error("Version not found: {runtime} {version}")]
    VersionNotFound { runtime: String, version: String },

    #[error("Service not found: {0}")]
    ServiceNotFound(String),

    #[error("Dependency missing: {0}")]
    DependencyMissing(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Archive error: {0}")]
    Archive(String),

    #[error("{0}")]
    Other(String),
}

// Tauri requires errors to implement Serialize
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
