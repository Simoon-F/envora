use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

const ADOPTIUM_API_BASE: &str = "https://api.adoptium.net/v3/binary/latest";
const JAVA_FEATURE_VERSIONS: &[&str] = &["26", "25", "21", "17", "11", "8"];
const JAVA_TOOLS: &[&str] = &[
    "java",
    "javac",
    "jar",
    "javadoc",
    "jshell",
    "keytool",
    "jcmd",
    "jconsole",
    "jdb",
    "jdeps",
    "jfr",
    "jlink",
    "jmap",
    "jmod",
    "jpackage",
    "jps",
    "jrunscript",
    "jstack",
    "jstat",
    "jwebserver",
];

#[cfg(target_os = "macos")]
fn adoptium_os() -> &'static str {
    "mac"
}

#[cfg(target_os = "windows")]
fn adoptium_os() -> &'static str {
    "windows"
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn adoptium_os() -> &'static str {
    "linux"
}

#[cfg(target_arch = "aarch64")]
fn adoptium_arch() -> &'static str {
    "aarch64"
}

#[cfg(target_arch = "x86_64")]
fn adoptium_arch() -> &'static str {
    "x64"
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
fn adoptium_arch() -> &'static str {
    "x64"
}

fn java_download_url(feature_version: &str) -> String {
    format!(
        "{base}/{version}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse",
        base = ADOPTIUM_API_BASE,
        version = feature_version,
        os = adoptium_os(),
        arch = adoptium_arch(),
    )
}

#[cfg(target_os = "windows")]
fn java_archive_name(feature_version: &str) -> String {
    format!(
        "temurin-jdk-{}-{}-{}.zip",
        feature_version,
        adoptium_os(),
        adoptium_arch()
    )
}

#[cfg(not(target_os = "windows"))]
fn java_archive_name(feature_version: &str) -> String {
    format!(
        "temurin-jdk-{}-{}-{}.tar.gz",
        feature_version,
        adoptium_os(),
        adoptium_arch()
    )
}

#[cfg(target_os = "windows")]
fn tool_file_name(tool: &str) -> String {
    format!("{}.exe", tool)
}

#[cfg(not(target_os = "windows"))]
fn tool_file_name(tool: &str) -> String {
    tool.to_string()
}

pub struct JavaProvider {
    runtime_dir: PathBuf,
    bin_dir: PathBuf,
}

impl JavaProvider {
    pub fn new(runtime_dir: PathBuf, bin_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            bin_dir,
        }
    }

    fn java_dir(&self) -> PathBuf {
        self.runtime_dir.join("java")
    }

    fn version_dir(&self, version: &str) -> PathBuf {
        self.java_dir().join(version)
    }

    fn versions_file(&self) -> PathBuf {
        self.java_dir().join("versions.json")
    }

    fn default_home_file(&self) -> PathBuf {
        self.java_dir().join("default_home")
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
        std::fs::create_dir_all(self.java_dir())?;
        std::fs::write(self.versions_file(), content)?;
        Ok(())
    }

    fn normalize_extracted_package(extract_dir: &Path, install_dir: &Path) -> Result<(), AppError> {
        let package_root = extract_dir
            .read_dir()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .map(|e| e.path())
            .ok_or_else(|| AppError::Archive("JDK archive has unexpected structure".to_string()))?;

        let jdk_home = {
            let mac_home = package_root.join("Contents").join("Home");
            if mac_home.join("bin").join("java").exists() {
                mac_home
            } else {
                package_root
            }
        };

        for entry in std::fs::read_dir(&jdk_home)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), dest)?;
        }

        Ok(())
    }

    fn remove_tool_links(&self) {
        for tool in JAVA_TOOLS {
            let link = self.bin_dir.join(tool_file_name(tool));
            if link.exists() {
                let _ = std::fs::remove_file(link);
            }
        }
    }
}

#[async_trait]
impl RuntimeProvider for JavaProvider {
    fn runtime_type(&self) -> RuntimeType {
        RuntimeType::Java
    }

    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError> {
        let installed = self.list_installed()?;
        let default = self.get_default()?;

        Ok(JAVA_FEATURE_VERSIONS
            .iter()
            .map(|version| {
                let is_installed = installed.iter().any(|v| v.version == *version);
                VersionInfo {
                    version: version.to_string(),
                    download_url: Some(java_download_url(version)),
                    size: None,
                    sha256: None,
                    is_installed,
                    is_default: default.as_deref() == Some(*version),
                }
            })
            .collect())
    }

    async fn install(
        &self,
        version: &str,
        mut on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError> {
        if !JAVA_FEATURE_VERSIONS.contains(&version) {
            return Err(AppError::VersionNotFound {
                runtime: "java".to_string(),
                version: version.to_string(),
            });
        }

        let install_dir = self.version_dir(version);
        if install_dir.exists() {
            std::fs::remove_dir_all(&install_dir)?;
        }
        std::fs::create_dir_all(&install_dir)?;

        let download_dir = PathBuf::from("/tmp/envora-download");
        std::fs::create_dir_all(&download_dir)?;
        let archive_path = download_dir.join(java_archive_name(version));

        let cb_arc = on_progress.take().map(Arc::new);
        if let Some(ref cb) = cb_arc {
            cb(0.0, format!("Downloading Temurin JDK {}...", version));
        }

        let download_cb: Option<crate::download::manager::ProgressCallback> =
            cb_arc.as_ref().map(|arc| {
                let arc = arc.clone();
                let cb: crate::download::manager::ProgressCallback =
                    Box::new(move |pct: f64, downloaded: u64, total: u64| {
                        let app_pct = 70.0 * pct / 100.0;
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

        DownloadManager::download(&java_download_url(version), &archive_path, download_cb).await?;

        let on_progress = cb_arc.map(|arc| Arc::try_unwrap(arc).ok()).flatten();

        if let Some(ref cb) = on_progress {
            cb(72.0, "Extracting JDK...".to_string());
        }

        let extract_dir = download_dir.join(format!("java-extract-{}", version));
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
        let java_bin = install_dir.join("bin").join(tool_file_name("java"));

        if !java_bin.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "java".to_string(),
                version: version.to_string(),
            });
        }

        if let Some(parent) = self.bin_dir.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::create_dir_all(&self.bin_dir)?;

        for tool in JAVA_TOOLS {
            let file_name = tool_file_name(tool);
            let src = install_dir.join("bin").join(&file_name);
            if src.exists() {
                let link = self.bin_dir.join(&file_name);
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
