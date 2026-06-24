use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

const GO_DL_INDEX_URL: &str = "https://go.dev/dl/?mode=json";
const GO_DOWNLOAD_BASES: &[&str] = &[
    "https://mirrors.aliyun.com/golang",
    "https://dl.google.com/go",
    "https://go.dev/dl",
];
const GO_TOOLS: &[&str] = &["go", "gofmt"];

#[derive(Debug, Clone, Deserialize)]
struct GoReleaseResponse {
    version: String,
    stable: bool,
    files: Vec<GoReleaseFile>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoReleaseFile {
    filename: String,
    os: String,
    arch: String,
    sha256: String,
    size: u64,
    kind: String,
}

#[derive(Debug, Clone)]
struct GoRelease {
    version: String,
    download_url: String,
    archive_name: String,
    sha256: String,
    size: u64,
}

#[cfg(target_os = "macos")]
fn go_os() -> &'static str {
    "darwin"
}

#[cfg(target_os = "windows")]
fn go_os() -> &'static str {
    "windows"
}

#[cfg(target_os = "linux")]
fn go_os() -> &'static str {
    "linux"
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn go_os() -> &'static str {
    "unsupported"
}

#[cfg(target_arch = "aarch64")]
fn go_arch() -> &'static str {
    "arm64"
}

#[cfg(target_arch = "x86_64")]
fn go_arch() -> &'static str {
    "amd64"
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
fn go_arch() -> &'static str {
    "unsupported"
}

#[cfg(target_os = "windows")]
fn go_tool_file_name(tool: &str) -> String {
    format!("{}.exe", tool)
}

#[cfg(not(target_os = "windows"))]
fn go_tool_file_name(tool: &str) -> String {
    tool.to_string()
}

fn go_tool_path(install_dir: &Path, tool: &str) -> PathBuf {
    install_dir.join("bin").join(go_tool_file_name(tool))
}

fn go_download_url(base: &str, filename: &str) -> String {
    format!("{}/{}", base.trim_end_matches('/'), filename)
}

async fn fetch_go_releases() -> Result<Vec<GoRelease>, AppError> {
    let response = reqwest::Client::builder()
        .user_agent("envora/0.1")
        .build()
        .map_err(|e| AppError::Download(e.to_string()))?
        .get(GO_DL_INDEX_URL)
        .send()
        .await?
        .error_for_status()?;

    let body = response.text().await?;
    let releases: Vec<GoReleaseResponse> = serde_json::from_str(&body)?;
    let os = go_os();
    let arch = go_arch();

    if os == "unsupported" || arch == "unsupported" {
        return Ok(Vec::new());
    }

    Ok(releases
        .into_iter()
        .filter(|release| release.stable)
        .filter_map(|release| {
            let file = release
                .files
                .into_iter()
                .find(|file| file.kind == "archive" && file.os == os && file.arch == arch)?;
            let version = release.version.trim_start_matches("go").to_string();
            Some(GoRelease {
                version,
                download_url: go_download_url(GO_DOWNLOAD_BASES[0], &file.filename),
                archive_name: file.filename,
                sha256: file.sha256,
                size: file.size,
            })
        })
        .collect())
}

pub struct GoProvider {
    runtime_dir: PathBuf,
    bin_dir: PathBuf,
}

impl GoProvider {
    pub fn new(runtime_dir: PathBuf, bin_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            bin_dir,
        }
    }

    fn go_dir(&self) -> PathBuf {
        self.runtime_dir.join("go")
    }

    fn version_dir(&self, version: &str) -> PathBuf {
        self.go_dir().join(version)
    }

    fn versions_file(&self) -> PathBuf {
        self.go_dir().join("versions.json")
    }

    fn default_home_file(&self) -> PathBuf {
        self.go_dir().join("default_home")
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
        std::fs::create_dir_all(self.go_dir())?;
        std::fs::write(self.versions_file(), content)?;
        Ok(())
    }

    fn normalize_extracted_package(extract_dir: &Path, install_dir: &Path) -> Result<(), AppError> {
        let package_root = extract_dir.join("go");
        if !package_root
            .join("bin")
            .join(go_tool_file_name("go"))
            .exists()
        {
            return Err(AppError::Archive(
                "Go archive has unexpected structure".to_string(),
            ));
        }

        for entry in std::fs::read_dir(&package_root)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            PlatformOps::move_path(&entry.path(), &dest)?;
        }

        Ok(())
    }

    fn remove_tool_links(&self) {
        for tool in GO_TOOLS {
            let link = self.bin_dir.join(go_tool_file_name(tool));
            if link.exists() {
                let _ = std::fs::remove_file(link);
            }
        }
    }
}

#[async_trait]
impl RuntimeProvider for GoProvider {
    fn runtime_type(&self) -> RuntimeType {
        RuntimeType::Go
    }

    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError> {
        let installed = self.list_installed()?;
        let default = self.get_default()?;
        let releases = fetch_go_releases().await?;

        Ok(releases
            .into_iter()
            .map(|release| {
                let is_installed = installed.iter().any(|v| v.version == release.version);
                VersionInfo {
                    version: release.version.clone(),
                    download_url: Some(release.download_url),
                    size: Some(release.size),
                    sha256: Some(release.sha256),
                    is_installed,
                    is_default: default.as_deref() == Some(release.version.as_str()),
                }
            })
            .collect())
    }

    async fn install(
        &self,
        version: &str,
        mut on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError> {
        let releases = fetch_go_releases().await?;
        let release = releases
            .into_iter()
            .find(|release| release.version == version)
            .ok_or_else(|| AppError::VersionNotFound {
                runtime: "go".to_string(),
                version: version.to_string(),
            })?;

        let install_dir = self.version_dir(version);
        if install_dir.exists() {
            std::fs::remove_dir_all(&install_dir)?;
        }
        std::fs::create_dir_all(&install_dir)?;

        let download_dir = self.go_dir().join(".downloads");
        std::fs::create_dir_all(&download_dir)?;
        let archive_path = download_dir.join(&release.archive_name);

        let cb_arc = on_progress.take().map(Arc::new);
        if let Some(ref cb) = cb_arc {
            cb(0.0, format!("Downloading Go {}...", version));
        }

        let mut download_errors = Vec::new();
        let mut downloaded = false;
        for base in GO_DOWNLOAD_BASES {
            let url = go_download_url(base, &release.archive_name);
            if let Some(ref cb) = cb_arc {
                cb(0.0, format!("Downloading Go {} from {}...", version, base));
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

            match DownloadManager::download_with_checksum(
                &url,
                &archive_path,
                Some(&release.sha256),
                download_cb,
            )
            .await
            {
                Ok(_) => {
                    downloaded = true;
                    break;
                }
                Err(error) => {
                    let _ = std::fs::remove_file(&archive_path);
                    download_errors.push(format!("{}: {}", base, error));
                    if let Some(ref cb) = cb_arc {
                        cb(
                            0.0,
                            "Download source failed, trying next mirror...".to_string(),
                        );
                    }
                }
            }
        }

        if !downloaded {
            return Err(AppError::Download(format!(
                "All Go download sources failed: {}",
                download_errors.join("; ")
            )));
        }

        let on_progress = cb_arc.map(|arc| Arc::try_unwrap(arc).ok()).flatten();

        if let Some(ref cb) = on_progress {
            cb(78.0, "Extracting Go...".to_string());
        }

        let extract_dir = download_dir.join(format!("go-extract-{}", version));
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
            let default_home = self.default_home_file();
            if default_home.exists() {
                std::fs::remove_file(default_home)?;
            }
        }

        Ok(())
    }

    fn list_installed(&self) -> Result<Vec<RuntimeVersion>, AppError> {
        Ok(self.load_installed_versions())
    }

    fn switch_default(&self, version: &str) -> Result<(), AppError> {
        let install_dir = self.version_dir(version);
        let go_bin = go_tool_path(&install_dir, "go");

        if !go_bin.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "go".to_string(),
                version: version.to_string(),
            });
        }

        if let Some(parent) = self.bin_dir.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::create_dir_all(&self.bin_dir)?;

        for tool in GO_TOOLS {
            let src = go_tool_path(&install_dir, tool);
            if src.exists() {
                let link = self.bin_dir.join(go_tool_file_name(tool));
                PlatformOps::create_link(&src, &link)?;
            }
        }

        if let Some(parent) = self.default_home_file().parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(self.default_home_file(), install_dir.display().to_string())?;

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
