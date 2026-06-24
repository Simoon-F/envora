use std::path::PathBuf;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::core::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeType {
    Php,
    Nginx,
    Mysql,
    Java,
    Node,
    Go,
}

impl RuntimeType {
    pub fn as_str(&self) -> &str {
        match self {
            RuntimeType::Php => "php",
            RuntimeType::Nginx => "nginx",
            RuntimeType::Mysql => "mysql",
            RuntimeType::Java => "java",
            RuntimeType::Node => "node",
            RuntimeType::Go => "go",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "php" => Some(RuntimeType::Php),
            "nginx" => Some(RuntimeType::Nginx),
            "mysql" => Some(RuntimeType::Mysql),
            "java" => Some(RuntimeType::Java),
            "node" | "nodejs" => Some(RuntimeType::Node),
            "go" | "golang" => Some(RuntimeType::Go),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub version: String,
    pub download_url: Option<String>,
    pub size: Option<u64>,
    pub sha256: Option<String>,
    pub is_installed: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeVersion {
    pub version: String,
    pub install_dir: PathBuf,
    pub installed_at: String,
    pub size: u64,
    pub is_default: bool,
}

/// Progress callback for installation
pub type ProgressCallback = Box<dyn Fn(f64, String) + Send + Sync>;

/// Trait for runtime providers (PHP, Nginx, MySQL, etc.)
#[async_trait]
pub trait RuntimeProvider: Send + Sync {
    /// Get the runtime type
    fn runtime_type(&self) -> RuntimeType;

    /// List available versions for installation
    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError>;

    /// Install a specific version
    async fn install(
        &self,
        version: &str,
        on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError>;

    /// Uninstall a specific version
    async fn uninstall(&self, version: &str) -> Result<(), AppError>;

    /// List installed versions
    fn list_installed(&self) -> Result<Vec<RuntimeVersion>, AppError>;

    /// Set a version as the default
    fn switch_default(&self, version: &str) -> Result<(), AppError>;

    /// Get the current default version
    fn get_default(&self) -> Result<Option<String>, AppError>;
}
