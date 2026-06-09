use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

/// GitHub Releases base URL for pre-compiled runtime packages.
/// Runtime assets live in the dedicated envora-runtime-packages repository.
/// Release tag: php-{version}, file: php-{version}-macos-{arch}.tar.gz
const PHP_RELEASES_BASE: &str =
    "https://github.com/Simoon-F/envora-runtime-packages/releases/download";
const PHP_WINDOWS_RELEASES_BASE: &str = "https://windows.php.net/downloads/releases/archives";

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
#[cfg(target_os = "macos")]
fn php_download_url(version: &str) -> String {
    format!(
        "{base}/php-{version}/php-{version}-macos-{arch}.tar.gz",
        base = PHP_RELEASES_BASE,
        version = version,
        arch = macos_arch(),
    )
}

#[cfg(target_os = "windows")]
fn php_download_url(version: &str) -> String {
    format!(
        "{base}/php-{version}-nts-Win32-vs17-x64.zip",
        base = PHP_WINDOWS_RELEASES_BASE,
        version = version,
    )
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn php_download_url(version: &str) -> String {
    format!("https://www.php.net/distributions/php-{}.tar.gz", version)
}

#[cfg(target_os = "macos")]
fn php_archive_name(version: &str) -> String {
    format!("php-{}-macos-{}.tar.gz", version, macos_arch())
}

#[cfg(target_os = "windows")]
fn php_archive_name(version: &str) -> String {
    format!("php-{}-nts-Win32-vs17-x64.zip", version)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn php_archive_name(version: &str) -> String {
    format!("php-{}.tar.gz", version)
}

#[cfg(target_os = "macos")]
fn php_binary_path(install_dir: &std::path::Path) -> PathBuf {
    install_dir.join("bin").join("php")
}

#[cfg(target_os = "windows")]
fn php_binary_path(install_dir: &std::path::Path) -> PathBuf {
    install_dir.join("php.exe")
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn php_binary_path(install_dir: &std::path::Path) -> PathBuf {
    install_dir.join("bin").join("php")
}

#[cfg(target_os = "macos")]
fn php_ini_path(install_dir: &std::path::Path) -> PathBuf {
    install_dir.join("lib").join("php.ini")
}

#[cfg(target_os = "windows")]
fn php_ini_path(install_dir: &std::path::Path) -> PathBuf {
    install_dir.join("php.ini")
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn php_ini_path(install_dir: &std::path::Path) -> PathBuf {
    install_dir.join("lib").join("php.ini")
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

    /// Fix hardcoded build paths in php-config and phpize to point to the actual install dir
    fn patch_build_paths(install_dir: &std::path::Path) -> Result<(), AppError> {
        // The build prefix embedded in the pre-compiled package
        // (we know it from release-runtimes.md: /tmp/php-package/{version})
        let version = install_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let build_prefix = format!("/tmp/php-package/{}", version);
        let install_str = install_dir.display().to_string();

        // Patch php-config
        let php_config = install_dir.join("bin").join("php-config");
        if php_config.exists() {
            let content = std::fs::read_to_string(&php_config)?;
            let patched = content.replace(&build_prefix, &install_str);
            std::fs::write(&php_config, patched)?;
        }

        // Patch phpize
        let phpize = install_dir.join("bin").join("phpize");
        if phpize.exists() {
            let content = std::fs::read_to_string(&phpize)?;
            let patched = content.replace(&build_prefix, &install_str);
            std::fs::write(&phpize, patched)?;
        }

        Ok(())
    }

    /// Ensure extension_dir is correctly set in php.ini
    fn ensure_extension_dir(install_dir: &std::path::Path) -> Result<(), AppError> {
        let php_ini = php_ini_path(install_dir);
        if !php_ini.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&php_ini).unwrap_or_default();
        if content
            .lines()
            .any(|l| l.trim().starts_with("extension_dir"))
        {
            return Ok(()); // already set
        }

        #[cfg(target_os = "windows")]
        let base = install_dir.join("ext");
        #[cfg(not(target_os = "windows"))]
        let base = install_dir.join("lib").join("php").join("extensions");

        let mut ext_dir = String::new();
        if base.exists() {
            #[cfg(target_os = "windows")]
            {
                ext_dir = base.display().to_string();
            }
            #[cfg(not(target_os = "windows"))]
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    if entry.path().is_dir()
                        && !entry.file_name().to_string_lossy().starts_with("._")
                    {
                        ext_dir = entry.path().display().to_string();
                        break;
                    }
                }
            }
        }

        if !ext_dir.is_empty() {
            let new_content = format!("{}\nextension_dir = \"{}\"", content.trim_end(), ext_dir);
            std::fs::write(&php_ini, new_content)?;
        }

        Ok(())
    }

    /// Generate php-fpm.conf and www pool config for the installed PHP
    #[cfg(target_os = "macos")]
    fn generate_fpm_configs(install_dir: &std::path::Path) -> Result<(), AppError> {
        let etc_dir = install_dir.join("etc");
        let fpm_d_dir = etc_dir.join("php-fpm.d");
        let var_dir = install_dir.join("var");
        let run_dir = var_dir.join("run");
        let log_dir = install_dir.join("var").join("log");

        std::fs::create_dir_all(&fpm_d_dir)?;
        std::fs::create_dir_all(&run_dir)?;
        std::fs::create_dir_all(&log_dir)?;

        // Get current user/group
        let user = whoami::username();
        let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let envora_logs = home.join(".envora").join("logs");
        let _ = std::fs::create_dir_all(&envora_logs);

        let install_str = install_dir.display().to_string();
        let logs_str = envora_logs.display().to_string();

        // php-fpm.conf
        let fpm_conf = format!(
            "[global]\n\
             pid = {install}/var/run/php-fpm.pid\n\
             error_log = {logs}/php-fpm.log\n\
             log_level = notice\n\
             daemonize = no\n\
             emergency_restart_threshold = 5\n\
             emergency_restart_interval = 1m\n\
             process_control_timeout = 10s\n\
             \n\
             include = {install}/etc/php-fpm.d/*.conf\n",
            install = install_str,
            logs = logs_str,
        );
        std::fs::write(etc_dir.join("php-fpm.conf"), fpm_conf)?;

        // www pool config
        let www_conf = format!(
            "[www]\n\
             user = {user}\n\
             group = staff\n\
             listen = 127.0.0.1:9000\n\
             listen.allowed_clients = 127.0.0.1\n\
             \n\
             pm = dynamic\n\
             pm.max_children = 10\n\
             pm.start_servers = 2\n\
             pm.min_spare_servers = 1\n\
             pm.max_spare_servers = 4\n\
             \n\
             pm.status_path = /status\n\
             access.log = {logs}/php-fpm-access.log\n\
             \n\
             php_admin_value[error_log] = {logs}/php-error.log\n\
             php_admin_flag[log_errors] = on\n\
             \n\
             clear_env = no\n\
             catch_workers_output = yes\n\
             decorate_workers_output = no\n",
            user = user,
            logs = logs_str,
        );
        std::fs::write(fpm_d_dir.join("www.conf"), www_conf)?;

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn generate_fpm_configs(_install_dir: &std::path::Path) -> Result<(), AppError> {
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn move_extracted_package(
        extract_temp: &std::path::Path,
        install_dir: &std::path::Path,
    ) -> Result<(), AppError> {
        // The tar contains `8.4.1/` — move contents to install_dir
        let inner_dir = extract_temp
            .read_dir()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .map(|e| e.path())
            .ok_or_else(|| {
                AppError::Archive("Pre-compiled package has unexpected structure".to_string())
            })?;

        for entry in std::fs::read_dir(&inner_dir)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), &dest)?;
        }

        Ok(())
    }

    #[cfg(target_os = "windows")]
    fn move_extracted_package(
        extract_temp: &std::path::Path,
        install_dir: &std::path::Path,
    ) -> Result<(), AppError> {
        for entry in std::fs::read_dir(extract_temp)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), &dest)?;
        }

        Ok(())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn move_extracted_package(
        extract_temp: &std::path::Path,
        install_dir: &std::path::Path,
    ) -> Result<(), AppError> {
        for entry in std::fs::read_dir(extract_temp)? {
            let entry = entry?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), &dest)?;
        }

        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn sign_runtime_binaries(install_dir: &std::path::Path) -> Result<(), AppError> {
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

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    fn sign_runtime_binaries(_install_dir: &std::path::Path) -> Result<(), AppError> {
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
        mut on_progress: Option<ProgressCallback>,
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

        // Download pre-compiled package with real-time progress
        let url = php_download_url(version);

        let download_dir = PathBuf::from("/tmp/envora-download");
        std::fs::create_dir_all(&download_dir)?;
        let archive_path = download_dir.join(php_archive_name(version));

        // Share the progress callback with the download manager via Arc
        let cb_arc = on_progress.take().map(Arc::new);
        if let Some(ref cb) = cb_arc {
            cb(0.0, format!("Downloading PHP {} (23 MB)...", version));
        }

        let download_cb: Option<crate::download::manager::ProgressCallback> =
            cb_arc.as_ref().map(|arc| {
                let arc = arc.clone();
                let cb: crate::download::manager::ProgressCallback =
                    Box::new(move |pct: f64, downloaded: u64, total: u64| {
                        let app_pct = 30.0 * pct / 100.0;
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

        DownloadManager::download(&url, &archive_path, download_cb).await?;

        // Recover the callback for subsequent steps
        let on_progress = cb_arc.map(|arc| Arc::try_unwrap(arc).ok()).flatten();

        // Extract directly to install_dir
        if let Some(ref cb) = on_progress {
            cb(30.0, "Extracting...".to_string());
        }

        // Extract to a temp location first so platform-specific package layouts can be normalized.
        let extract_temp = download_dir.join(format!("php-extract-{}", version));
        let _ = std::fs::remove_dir_all(&extract_temp);
        std::fs::create_dir_all(&extract_temp)?;
        ArchiveExtractor::extract(&archive_path, &extract_temp)?;

        Self::move_extracted_package(&extract_temp, &install_dir)?;

        // Clean up
        let _ = std::fs::remove_dir_all(&extract_temp);
        let _ = std::fs::remove_file(&archive_path);

        // Patch hardcoded build paths in php-config & phpize
        if let Some(ref cb) = on_progress {
            cb(55.0, "Patching build paths...".to_string());
        }
        Self::patch_build_paths(&install_dir)?;

        // Sign binaries for macOS Gatekeeper
        if let Some(ref cb) = on_progress {
            cb(60.0, "Signing binaries...".to_string());
        }

        Self::sign_runtime_binaries(&install_dir)?;

        // Generate php.ini
        if let Some(ref cb) = on_progress {
            cb(80.0, "Generating php.ini...".to_string());
        }

        let php_ini = php_ini_path(&install_dir);
        if !php_ini.exists() {
            std::fs::write(
                &php_ini,
                include_str!("../../assets/php.ini.default")
                    .replace("{INSTALL_DIR}", &install_dir.display().to_string()),
            )?;
        }

        // Ensure extension_dir is set in php.ini
        Self::ensure_extension_dir(&install_dir)?;

        // Generate php-fpm.conf and pool config
        if let Some(ref cb) = on_progress {
            cb(90.0, "Generating FPM configuration...".to_string());
        }
        Self::generate_fpm_configs(&install_dir)?;

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
            #[cfg(target_os = "windows")]
            let link = self.bin_dir.join("php.exe");
            #[cfg(not(target_os = "windows"))]
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
        let php_bin = php_binary_path(&install_dir);

        if !php_bin.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "php".to_string(),
                version: version.to_string(),
            });
        }

        #[cfg(target_os = "windows")]
        let link = self.bin_dir.join("php.exe");
        #[cfg(not(target_os = "windows"))]
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
