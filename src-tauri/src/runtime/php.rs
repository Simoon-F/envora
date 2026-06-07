use std::path::PathBuf;

use async_trait::async_trait;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

/// GitHub Releases base URL for pre-compiled PHP packages.
/// Release tag: php-{version}, file: php-{version}-macos-{arch}.tar.gz
const PHP_RELEASES_BASE: &str =
    "https://github.com/Simoon-F/envora/releases/download";

const PHP_VERSIONS: &[&str] = &["8.4.1", "8.3.14", "8.2.26", "8.1.31"];

/// Detect macOS architecture for pre-compiled package selection
fn macos_arch() -> &'static str {
    #[cfg(target_arch = "aarch64")]
    {
        "arm64"
    }
    #[cfg(target_arch = "x86_64")]
    {
        "x86_64"
    }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        "x86_64" // fallback
    }
}

/// Build the download URL for a pre-compiled PHP package
fn php_download_url(version: &str) -> String {
    format!(
        "{base}/php-{version}/php-{version}-macos-{arch}.tar.gz",
        base = PHP_RELEASES_BASE,
        version = version,
        arch = macos_arch(),
    )
}

pub struct PhpProvider {
    runtime_dir: PathBuf,
    bin_dir: PathBuf,
}

impl PhpProvider {
    pub fn new(runtime_dir: PathBuf, bin_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            bin_dir,
        }
    }

    fn php_dir(&self) -> PathBuf {
        self.runtime_dir.join("php")
    }

    fn version_dir(&self, version: &str) -> PathBuf {
        self.php_dir().join(version)
    }

    fn versions_file(&self) -> PathBuf {
        self.php_dir().join("versions.json")
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
        std::fs::create_dir_all(self.php_dir())?;
        std::fs::write(self.versions_file(), content)?;
        Ok(())
    }
}

#[async_trait]
impl RuntimeProvider for PhpProvider {
    fn runtime_type(&self) -> RuntimeType {
        RuntimeType::Php
    }

    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError> {
        let installed = self.list_installed()?;
        let default = self.get_default()?;

        Ok(PHP_VERSIONS
            .iter()
            .map(|version| {
                let is_installed = installed.iter().any(|v| v.version == *version);
                VersionInfo {
                    version: version.to_string(),
                    download_url: Some(php_download_url(version)),
                    size: None,
                    sha256: None,
                    is_installed,
                    is_default: default.as_deref() == Some(*version),
                }
            })
            .collect())
    }

    /// Install a PHP version from pre-compiled binary package.
    ///
    /// Steps:
    /// 1. Download pre-compiled tar.gz from GitHub Releases
    /// 2. Extract directly to the target install directory
    /// 3. Ad-hoc sign the binaries (macOS Gatekeeper)
    /// 4. Write default php.ini
    /// 5. Record version and update default symlink
    async fn install(
        &self,
        version: &str,
        on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError> {
        // Validate version exists
        if !PHP_VERSIONS.contains(&version) {
            return Err(AppError::VersionNotFound {
                runtime: "php".to_string(),
                version: version.to_string(),
            });
        }

        let install_dir = self.version_dir(version);

        // Remove existing installation if re-installing
        if install_dir.exists() {
            std::fs::remove_dir_all(&install_dir)?;
        }
        std::fs::create_dir_all(&install_dir)?;

        // Download pre-compiled package
        let url = php_download_url(version);
        if let Some(ref cb) = on_progress {
            cb(0.0, format!("Downloading PHP {}...", version));
        }

        let download_dir = PathBuf::from("/tmp/envora-download");
        std::fs::create_dir_all(&download_dir)?;
        let archive_path = download_dir.join(format!("php-{}-macos-{}.tar.gz", version, macos_arch()));
        DownloadManager::download(&url, &archive_path, None).await?;

        // Extract directly to install_dir
        if let Some(ref cb) = on_progress {
            cb(30.0, "Extracting...".to_string());
        }

        // Extract to a temp location first since the tar contains a version directory
        let extract_temp = download_dir.join(format!("php-extract-{}", version));
        let _ = std::fs::remove_dir_all(&extract_temp);
        std::fs::create_dir_all(&extract_temp)?;
        ArchiveExtractor::extract(&archive_path, &extract_temp)?;

        // The tar contains `8.4.1/` — move contents to install_dir
        let inner_dir = extract_temp
            .read_dir()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .map(|e| e.path())
            .ok_or_else(|| {
                AppError::Archive("Pre-compiled package has unexpected structure".to_string())
            })?;

        // Move all files from inner_dir to install_dir
        for entry in std::fs::read_dir(&inner_dir)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), &dest)?;
        }

        // Clean up
        let _ = std::fs::remove_dir_all(&extract_temp);
        let _ = std::fs::remove_file(&archive_path);

        // Sign binaries for macOS Gatekeeper
        if let Some(ref cb) = on_progress {
            cb(80.0, "Signing binaries...".to_string());
        }

        for bin_name in &["php", "php-cgi", "php-fpm"] {
            let bin_path = if *bin_name == "php-fpm" {
                install_dir.join("sbin").join(bin_name)
            } else {
                install_dir.join("bin").join(bin_name)
            };
            if bin_path.exists() {
                PlatformOps::sign_binary(&bin_path)?;
            }
        }

        // Generate php.ini if not already present (should be in the pre-compiled package)
        if let Some(ref cb) = on_progress {
            cb(90.0, "Generating configuration...".to_string());
        }

        let php_ini = install_dir.join("lib").join("php.ini");
        if !php_ini.exists() {
            std::fs::write(
                &php_ini,
                include_str!("../../assets/php.ini.default")
                    .replace("{INSTALL_DIR}", &install_dir.display().to_string()),
            )?;
        }

        if let Some(ref cb) = on_progress {
            cb(100.0, "Installation complete!".to_string());
        }

        // Record installation
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

        // Update symlink
        self.switch_default(version)?;

        Ok(runtime_version)
    }

    async fn uninstall(&self, version: &str) -> Result<(), AppError> {
        let install_dir = self.version_dir(version);
        if install_dir.exists() {
            std::fs::remove_dir_all(&install_dir)?;
        }

        let mut versions = self.load_installed_versions();
        versions.retain(|v| v.version != version);
        self.save_installed_versions(&versions)?;

        // If this was the default, remove the symlink
        let default = self.get_default()?;
        if default.as_deref() == Some(version) {
            let link = self.bin_dir.join("php");
            if link.exists() {
                std::fs::remove_file(&link)?;
            }
        }

        Ok(())
    }

    fn list_installed(&self) -> Result<Vec<RuntimeVersion>, AppError> {
        Ok(self.load_installed_versions())
    }

    fn switch_default(&self, version: &str) -> Result<(), AppError> {
        let install_dir = self.version_dir(version);
        let php_bin = install_dir.join("bin").join("php");

        if !php_bin.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "php".to_string(),
                version: version.to_string(),
            });
        }

        let link = self.bin_dir.join("php");
        PlatformOps::create_link(&php_bin, &link)?;

        // Update versions.json
        let mut versions = self.load_installed_versions();
        for v in &mut versions {
            v.is_default = v.version == version;
        }
        self.save_installed_versions(&versions)?;

        Ok(())
    }

    fn get_default(&self) -> Result<Option<String>, AppError> {
        let versions = self.load_installed_versions();
        Ok(versions.iter().find(|v| v.is_default).map(|v| v.version.clone()))
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
