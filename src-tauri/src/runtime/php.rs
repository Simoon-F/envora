use std::path::PathBuf;

use async_trait::async_trait;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

const PHP_VERSIONS: &[(&str, &str)] = &[
    ("8.4.1", "https://www.php.net/distributions/php-8.4.1.tar.gz"),
    ("8.3.14", "https://www.php.net/distributions/php-8.3.14.tar.gz"),
    ("8.2.26", "https://www.php.net/distributions/php-8.2.26.tar.gz"),
    ("8.1.31", "https://www.php.net/distributions/php-8.1.31.tar.gz"),
];

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
            .map(|(version, url)| {
                let is_installed = installed.iter().any(|v| v.version == *version);
                VersionInfo {
                    version: version.to_string(),
                    download_url: Some(url.to_string()),
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
        on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError> {
        // Find download URL
        let url = PHP_VERSIONS
            .iter()
            .find(|(v, _)| *v == version)
            .map(|(_, url)| *url)
            .ok_or_else(|| AppError::VersionNotFound {
                runtime: "php".to_string(),
                version: version.to_string(),
            })?;

        // Create directories
        let install_dir = self.version_dir(version);
        std::fs::create_dir_all(&install_dir)?;

        // Use /tmp for building to avoid spaces in paths (PHP configure bug)
        let build_base = PathBuf::from("/tmp/envora-build");
        let build_dir = build_base.join(format!("php-{}", version));
        let _ = std::fs::remove_dir_all(&build_dir);
        std::fs::create_dir_all(&build_dir)?;

        // Download
        if let Some(ref cb) = on_progress {
            cb(0.0, "Downloading PHP source...".to_string());
        }

        let archive_path = build_dir.join(format!("php-{}.tar.gz", version));
        DownloadManager::download(url, &archive_path, None).await?;

        // Extract
        if let Some(ref cb) = on_progress {
            cb(20.0, "Extracting archive...".to_string());
        }

        ArchiveExtractor::extract(&archive_path, &build_dir)?;

        // Build from source
        if let Some(ref cb) = on_progress {
            cb(30.0, "Configuring...".to_string());
        }

        let source_dir = build_dir
            .read_dir()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .map(|e| e.path())
            .unwrap_or(build_dir.clone());

        // Resolve Homebrew prefix dynamically
        let brew_prefix = if std::path::Path::new("/opt/homebrew/bin/brew").exists() {
            String::from_utf8_lossy(
                &std::process::Command::new("/opt/homebrew/bin/brew")
                    .args(["--prefix"])
                    .output()
                    .map(|o| o.stdout)
                    .unwrap_or_default(),
            )
            .trim()
            .to_string()
        } else if std::path::Path::new("/usr/local/bin/brew").exists() {
            String::from_utf8_lossy(
                &std::process::Command::new("/usr/local/bin/brew")
                    .args(["--prefix"])
                    .output()
                    .map(|o| o.stdout)
                    .unwrap_or_default(),
            )
            .trim()
            .to_string()
        } else {
            "/usr/local".to_string()
        };
        let brew_opt = format!("{}/opt", brew_prefix);

        // Collect pkg-config paths from all relevant Homebrew packages
        let pkg_config_paths = [
            format!("{}/lib/pkgconfig", brew_prefix),
            format!("{}/openssl/lib/pkgconfig", brew_opt),
            format!("{}/openssl@3/lib/pkgconfig", brew_opt),
            format!("{}/libxml2/lib/pkgconfig", brew_opt),
            format!("{}/curl/lib/pkgconfig", brew_opt),
            format!("{}/zlib/lib/pkgconfig", brew_opt),
            format!("{}/sqlite/lib/pkgconfig", brew_opt),
            format!("{}/oniguruma/lib/pkgconfig", brew_opt),
            format!("{}/libiconv/lib/pkgconfig", brew_opt),
        ]
        .join(":");

        // Homebrew bison is keg-only, needs to be first in PATH
        let brew_bison = format!("{}/bison/bin", brew_opt);
        let path_extra = if std::path::Path::new(&brew_bison).exists() {
            format!("{}:{}/bin:{}/sbin", brew_bison, brew_prefix, brew_prefix)
        } else {
            format!("{}/bin:{}/sbin", brew_prefix, brew_prefix)
        };

        // Configure - use env -i to avoid PHP configure bug with spaces in paths,
        // but set TERM=dumb to avoid shtool terminal detection warnings.
        // Include Homebrew paths for pkg-config to find all dependencies.
        let configure_output = PlatformOps::shell_command(&format!(
            "cd \"{}\" && env -i \
                HOME=/tmp \
                TMPDIR=/tmp \
                TERM=dumb \
                PATH=\"/usr/bin:/bin:/usr/sbin:/sbin:{path_extra}\" \
                PKG_CONFIG_PATH=\"{pkg_config_paths}\" \
                CFLAGS=\"-I{brew_prefix}/include\" \
                CPPFLAGS=\"-I{brew_prefix}/include\" \
                LDFLAGS=\"-L{brew_prefix}/lib\" \
                ./configure --prefix=\"{prefix}\" \
                    --with-openssl \
                    --with-curl \
                    --with-zlib \
                    --with-iconv={brew_prefix} \
                    --enable-mbstring \
                    --enable-fpm \
                    --with-pdo-mysql \
                    --with-mysqli",
            source_dir.display(),
            path_extra = path_extra,
            pkg_config_paths = pkg_config_paths,
            brew_prefix = brew_prefix,
            prefix = install_dir.display(),
        ))
        .output()?;

        if !configure_output.status.success() {
            let stderr = String::from_utf8_lossy(&configure_output.stderr);
            let stdout_tail = String::from_utf8_lossy(&configure_output.stdout);
            // Include both stdout (last 2000 chars) and stderr for debugging
            let stdout_suffix = if stdout_tail.len() > 2000 {
                &stdout_tail[stdout_tail.len() - 2000..]
            } else {
                &stdout_tail
            };
            return Err(AppError::Build(format!(
                "Configure failed:\n--- stderr ---\n{}\n--- stdout tail ---\n{}",
                stderr,
                stdout_suffix
            )));
        }

        // Make
        if let Some(ref cb) = on_progress {
            cb(50.0, "Compiling...".to_string());
        }

        let num_cpus = PlatformOps::num_cpus();
        let make_output = PlatformOps::shell_command(&format!(
            "cd \"{}\" && make -j{}",
            source_dir.display(),
            num_cpus
        ))
        .output()?;

        if !make_output.status.success() {
            let stderr = String::from_utf8_lossy(&make_output.stderr);
            let stdout = String::from_utf8_lossy(&make_output.stdout);
            let stdout_suffix = if stdout.len() > 2000 {
                &stdout[stdout.len() - 2000..]
            } else {
                &stdout
            };
            return Err(AppError::Build(format!(
                "Make failed:\n--- stderr ---\n{}\n--- stdout tail ---\n{}",
                stderr,
                stdout_suffix
            )));
        }

        // Make install
        if let Some(ref cb) = on_progress {
            cb(80.0, "Installing...".to_string());
        }

        let install_output = PlatformOps::shell_command(&format!(
            "cd \"{}\" && make install",
            source_dir.display()
        ))
        .output()?;

        if !install_output.status.success() {
            let stderr = String::from_utf8_lossy(&install_output.stderr);
            let stdout = String::from_utf8_lossy(&install_output.stdout);
            let stdout_suffix = if stdout.len() > 2000 {
                &stdout[stdout.len() - 2000..]
            } else {
                &stdout
            };
            return Err(AppError::Build(format!(
                "Make install failed:\n--- stderr ---\n{}\n--- stdout tail ---\n{}",
                stderr,
                stdout_suffix
            )));
        }

        // Generate php.ini
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

        // Sign binary on macOS
        PlatformOps::sign_binary(&install_dir.join("bin").join("php"))?;

        // Clean up build directory
        let _ = std::fs::remove_dir_all(&build_dir);

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
