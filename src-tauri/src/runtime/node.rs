use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

const NODE_INDEX_URL: &str = "https://nodejs.org/download/release/index.json";
const NODE_RELEASE_BASE: &str = "https://nodejs.org/download/release";
const NODE_MAJOR_VERSIONS: &[u64] = &[26, 24, 22, 20, 18];
const NODE_TOOLS: &[&str] = &["node", "npm", "npx", "corepack"];

#[cfg(target_os = "macos")]
fn node_file_key() -> &'static str {
    #[cfg(target_arch = "aarch64")]
    {
        "osx-arm64-tar"
    }
    #[cfg(target_arch = "x86_64")]
    {
        "osx-x64-tar"
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        "osx-x64-tar"
    }
}

#[cfg(target_os = "windows")]
fn node_file_key() -> &'static str {
    #[cfg(target_arch = "aarch64")]
    {
        "win-arm64-zip"
    }
    #[cfg(target_arch = "x86_64")]
    {
        "win-x64-zip"
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        "win-x64-zip"
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn node_file_key() -> &'static str {
    "linux-x64"
}

#[cfg(target_os = "macos")]
fn node_platform_name() -> &'static str {
    #[cfg(target_arch = "aarch64")]
    {
        "darwin-arm64"
    }
    #[cfg(target_arch = "x86_64")]
    {
        "darwin-x64"
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        "darwin-x64"
    }
}

#[cfg(target_os = "windows")]
fn node_platform_name() -> &'static str {
    #[cfg(target_arch = "aarch64")]
    {
        "win-arm64"
    }
    #[cfg(target_arch = "x86_64")]
    {
        "win-x64"
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        "win-x64"
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn node_platform_name() -> &'static str {
    "linux-x64"
}

#[cfg(target_os = "windows")]
fn node_archive_name(version: &str) -> String {
    format!("node-v{}-{}.zip", version, node_platform_name())
}

#[cfg(not(target_os = "windows"))]
fn node_archive_name(version: &str) -> String {
    format!("node-v{}-{}.tar.gz", version, node_platform_name())
}

fn node_download_url(version: &str) -> String {
    format!(
        "{base}/v{version}/{archive}",
        base = NODE_RELEASE_BASE,
        version = version,
        archive = node_archive_name(version),
    )
}

#[cfg(target_os = "windows")]
fn node_tool_file_name(tool: &str) -> String {
    match tool {
        "node" => "node.exe".to_string(),
        _ => format!("{}.cmd", tool),
    }
}

#[cfg(not(target_os = "windows"))]
fn node_tool_file_name(tool: &str) -> String {
    tool.to_string()
}

#[cfg(target_os = "windows")]
fn node_tool_path(install_dir: &Path, tool: &str) -> PathBuf {
    install_dir.join(node_tool_file_name(tool))
}

#[cfg(not(target_os = "windows"))]
fn node_tool_path(install_dir: &Path, tool: &str) -> PathBuf {
    install_dir.join("bin").join(node_tool_file_name(tool))
}

#[derive(Debug, Clone)]
struct NodeRelease {
    version: String,
    download_url: String,
}

async fn fetch_node_releases() -> Result<Vec<NodeRelease>, AppError> {
    let response = reqwest::Client::builder()
        .user_agent("envora/0.1")
        .build()
        .map_err(|e| AppError::Download(e.to_string()))?
        .get(NODE_INDEX_URL)
        .send()
        .await?
        .error_for_status()?;

    let body = response.text().await?;
    let releases: Vec<Value> = serde_json::from_str(&body)?;
    let file_key = node_file_key();
    let mut selected = Vec::new();

    for major in NODE_MAJOR_VERSIONS {
        if let Some(release) = releases.iter().find(|release| {
            let Some(version) = release.get("version").and_then(|v| v.as_str()) else {
                return false;
            };
            if !version.starts_with(&format!("v{}.", major)) {
                return false;
            }
            release
                .get("files")
                .and_then(|files| files.as_array())
                .map(|files| files.iter().any(|file| file.as_str() == Some(file_key)))
                .unwrap_or(false)
        }) {
            if let Some(version) = release.get("version").and_then(|v| v.as_str()) {
                let version = version.trim_start_matches('v').to_string();
                selected.push(NodeRelease {
                    download_url: node_download_url(&version),
                    version,
                });
            }
        }
    }

    Ok(selected)
}

pub struct NodeProvider {
    runtime_dir: PathBuf,
    bin_dir: PathBuf,
}

impl NodeProvider {
    pub fn new(runtime_dir: PathBuf, bin_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            bin_dir,
        }
    }

    fn node_dir(&self) -> PathBuf {
        self.runtime_dir.join("node")
    }

    fn version_dir(&self, version: &str) -> PathBuf {
        self.node_dir().join(version)
    }

    fn versions_file(&self) -> PathBuf {
        self.node_dir().join("versions.json")
    }

    fn load_installed_versions(&self) -> Vec<RuntimeVersion> {
        let path = self.versions_file();
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        }
    }

    fn save_installed_versions(&self, versions: &[RuntimeVersion]) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(versions)?;
        std::fs::create_dir_all(self.node_dir())?;
        std::fs::write(self.versions_file(), content)?;
        Ok(())
    }

    fn normalize_extracted_package(extract_dir: &Path, install_dir: &Path) -> Result<(), AppError> {
        let package_root = extract_dir
            .read_dir()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .map(|e| e.path())
            .ok_or_else(|| {
                AppError::Archive("Node.js archive has unexpected structure".to_string())
            })?;

        for entry in std::fs::read_dir(&package_root)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), dest)?;
        }

        Ok(())
    }

    fn remove_tool_links(&self) {
        for tool in NODE_TOOLS {
            let link = self.bin_dir.join(node_tool_file_name(tool));
            if link.exists() {
                let _ = std::fs::remove_file(link);
            }
        }
    }
}

#[async_trait]
impl RuntimeProvider for NodeProvider {
    fn runtime_type(&self) -> RuntimeType {
        RuntimeType::Node
    }

    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError> {
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            return Ok(Vec::new());
        }

        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let installed = self.list_installed()?;
            let default = self.get_default()?;
            let releases = fetch_node_releases().await?;

            Ok(releases
                .into_iter()
                .map(|release| {
                    let is_installed = installed.iter().any(|v| v.version == release.version);
                    VersionInfo {
                        version: release.version.clone(),
                        download_url: Some(release.download_url),
                        size: None,
                        sha256: None,
                        is_installed,
                        is_default: default.as_deref() == Some(release.version.as_str()),
                    }
                })
                .collect())
        }
    }

    async fn install(
        &self,
        version: &str,
        mut on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError> {
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = version;
            return Err(AppError::Other(
                "Node.js installation is currently supported on macOS and Windows only".to_string(),
            ));
        }

        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let releases = fetch_node_releases().await?;
            let release = releases
                .into_iter()
                .find(|release| release.version == version)
                .ok_or_else(|| AppError::VersionNotFound {
                    runtime: "node".to_string(),
                    version: version.to_string(),
                })?;

            let install_dir = self.version_dir(version);
            if install_dir.exists() {
                std::fs::remove_dir_all(&install_dir)?;
            }
            std::fs::create_dir_all(&install_dir)?;

            let download_dir = PathBuf::from("/tmp/envora-download");
            std::fs::create_dir_all(&download_dir)?;
            let archive_path = download_dir.join(node_archive_name(version));

            let cb_arc = on_progress.take().map(Arc::new);
            if let Some(ref cb) = cb_arc {
                cb(0.0, format!("Downloading Node.js {}...", version));
            }

            let download_cb: Option<crate::download::manager::ProgressCallback> =
                cb_arc.as_ref().map(|arc| {
                    let arc = arc.clone();
                    let cb: crate::download::manager::ProgressCallback =
                        Box::new(move |pct: f64, downloaded: u64, total: u64| {
                            let app_pct = 75.0 * pct / 100.0;
                            let msg = if total > 0 {
                                format!(
                                    "Downloading... {:.0}% ({:.1} / {:.1} MB)",
                                    pct,
                                    downloaded as f64 / 1_048_576.0,
                                    total as f64 / 1_048_576.0
                                )
                            } else {
                                format!("Downloading... {:.1} MB", downloaded as f64 / 1_048_576.0)
                            };
                            arc(app_pct, msg);
                        });
                    cb
                });

            DownloadManager::download(&release.download_url, &archive_path, download_cb).await?;

            let on_progress = cb_arc.map(|arc| Arc::try_unwrap(arc).ok()).flatten();

            if let Some(ref cb) = on_progress {
                cb(78.0, "Extracting Node.js...".to_string());
            }

            let extract_dir = download_dir.join(format!("node-extract-{}", version));
            let _ = std::fs::remove_dir_all(&extract_dir);
            std::fs::create_dir_all(&extract_dir)?;
            ArchiveExtractor::extract(&archive_path, &extract_dir)?;
            Self::normalize_extracted_package(&extract_dir, &install_dir)?;

            let _ = std::fs::remove_dir_all(&extract_dir);
            let _ = std::fs::remove_file(&archive_path);

            if let Some(ref cb) = on_progress {
                cb(92.0, "Preparing command links...".to_string());
            }

            let runtime_version = RuntimeVersion {
                version: version.to_string(),
                install_dir: install_dir.clone(),
                installed_at: chrono::Local::now().to_rfc3339(),
                size: dir_size(&install_dir),
                is_default: false,
            };

            let mut versions = self.load_installed_versions();
            versions.retain(|v| v.version != version);
            versions.push(runtime_version.clone());
            self.save_installed_versions(&versions)?;

            self.switch_default(version)?;

            if let Some(ref cb) = on_progress {
                cb(100.0, "Installation complete!".to_string());
            }

            Ok(runtime_version)
        }
    }

    async fn uninstall(&self, version: &str) -> Result<(), AppError> {
        let was_default = self.get_default()?.as_deref() == Some(version);
        let install_dir = self.version_dir(version);
        if install_dir.exists() {
            std::fs::remove_dir_all(&install_dir)?;
        }

        let mut versions = self.load_installed_versions();
        versions.retain(|v| v.version != version);
        self.save_installed_versions(&versions)?;

        if was_default {
            self.remove_tool_links();
        }

        Ok(())
    }

    fn list_installed(&self) -> Result<Vec<RuntimeVersion>, AppError> {
        Ok(self.load_installed_versions())
    }

    fn switch_default(&self, version: &str) -> Result<(), AppError> {
        let install_dir = self.version_dir(version);
        let node_bin = node_tool_path(&install_dir, "node");

        if !node_bin.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "node".to_string(),
                version: version.to_string(),
            });
        }

        std::fs::create_dir_all(&self.bin_dir)?;

        for tool in NODE_TOOLS {
            let src = node_tool_path(&install_dir, tool);
            if src.exists() {
                let link = self.bin_dir.join(node_tool_file_name(tool));
                PlatformOps::create_link(&src, &link)?;
            }
        }

        let mut versions = self.load_installed_versions();
        for v in &mut versions {
            v.is_default = v.version == version;
        }
        self.save_installed_versions(&versions)?;

        Ok(())
    }

    fn get_default(&self) -> Result<Option<String>, AppError> {
        let versions = self.load_installed_versions();
        Ok(versions
            .iter()
            .find(|v| v.is_default)
            .map(|v| v.version.clone()))
    }
}

fn dir_size(path: &PathBuf) -> u64 {
    let mut size = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let metadata = entry.metadata();
            if let Ok(metadata) = metadata {
                if metadata.is_dir() {
                    size += dir_size(&entry.path());
                } else {
                    size += metadata.len();
                }
            }
        }
    }
    size
}
