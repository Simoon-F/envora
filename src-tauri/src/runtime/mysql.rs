use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

// MySQL Community Server pre-built packages
// Verify versions at: https://dev.mysql.com/downloads/mysql/
// Note: MySQL 8.0.x releases stopped around 8.0.37
const MYSQL_VERSIONS: &[(&str, &str)] = &[
    #[cfg(target_os = "macos")]
    (
        "8.4.3",
        "https://dev.mysql.com/get/Downloads/MySQL-8.4/mysql-8.4.3-macos14-arm64.tar.gz",
    ),
    #[cfg(target_os = "macos")]
    (
        "8.0.37",
        "https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.37-macos14-arm64.tar.gz",
    ),
    #[cfg(target_os = "windows")]
    (
        "8.4.3",
        "https://dev.mysql.com/get/Downloads/MySQL-8.4/mysql-8.4.3-winx64.zip",
    ),
    #[cfg(target_os = "windows")]
    (
        "8.0.37",
        "https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-8.0.37-winx64.zip",
    ),
];

pub struct MysqlProvider {
    runtime_dir: PathBuf,
    bin_dir: PathBuf,
}

impl MysqlProvider {
    pub fn new(runtime_dir: PathBuf, bin_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            bin_dir,
        }
    }

    fn mysql_dir(&self) -> PathBuf {
        self.runtime_dir.join("mysql")
    }

    fn version_dir(&self, version: &str) -> PathBuf {
        self.mysql_dir().join(version)
    }

    fn data_dir(&self, version: &str) -> PathBuf {
        self.version_dir(version).join("data")
    }

    fn versions_file(&self) -> PathBuf {
        self.mysql_dir().join("versions.json")
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
        std::fs::create_dir_all(self.mysql_dir())?;
        std::fs::write(self.versions_file(), content)?;
        Ok(())
    }
}

#[async_trait]
impl RuntimeProvider for MysqlProvider {
    fn runtime_type(&self) -> RuntimeType {
        RuntimeType::Mysql
    }

    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError> {
        let installed = self.list_installed()?;
        let default = self.get_default()?;

        Ok(MYSQL_VERSIONS
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
        mut on_progress: Option<ProgressCallback>,
    ) -> Result<RuntimeVersion, AppError> {
        let url = MYSQL_VERSIONS
            .iter()
            .find(|(v, _)| *v == version)
            .map(|(_, url)| *url)
            .ok_or_else(|| AppError::VersionNotFound {
                runtime: "mysql".to_string(),
                version: version.to_string(),
            })?;

        let install_dir = self.version_dir(version);
        std::fs::create_dir_all(&install_dir)?;

        // Download with progress
        let cb_arc = on_progress.take().map(Arc::new);
        if let Some(ref cb) = cb_arc {
            cb(0.0, format!("Downloading MySQL {}...", version));
        }

        let file_name = if url.ends_with(".tar.gz") {
            format!("mysql-{}.tar.gz", version)
        } else {
            format!("mysql-{}.zip", version)
        };
        let archive_path = install_dir.join(&file_name);

        let download_cb: Option<crate::download::manager::ProgressCallback> =
            cb_arc.as_ref().map(|arc| {
                let arc = arc.clone();
                let cb: crate::download::manager::ProgressCallback =
                    Box::new(move |pct: f64, downloaded: u64, total: u64| {
                        let app_pct = 20.0 * pct / 100.0;
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

        DownloadManager::download(url, &archive_path, download_cb).await?;

        let on_progress = cb_arc.map(|arc| Arc::try_unwrap(arc).ok()).flatten();

        // Extract
        if let Some(ref cb) = on_progress {
            cb(20.0, "Extracting archive...".to_string());
        }

        ArchiveExtractor::extract(&archive_path, &install_dir)?;

        // MySQL tarballs often contain a top-level directory
        // Move contents up if needed
        let entries: Vec<_> = std::fs::read_dir(&install_dir)?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir() && e.file_name().to_string_lossy().starts_with("mysql"))
            .collect();

        if entries.len() == 1 {
            let inner = entries[0].path();
            for entry in std::fs::read_dir(&inner)?.flatten() {
                let dest = install_dir.join(entry.file_name());
                std::fs::rename(entry.path(), dest)?;
            }
            let _ = std::fs::remove_dir_all(inner);
        }

        // Create required directories
        let logs_dir = install_dir.join("logs");
        std::fs::create_dir_all(&logs_dir)?;

        // Initialize data directory
        if let Some(ref cb) = on_progress {
            cb(60.0, "Initializing database...".to_string());
        }

        let data_dir = self.data_dir(version);
        std::fs::create_dir_all(&data_dir)?;

        let mysqld = install_dir.join("bin").join("mysqld");
        let init_output = PlatformOps::shell_command(&format!(
            "\"{}\" --initialize-insecure --datadir=\"{}\"",
            mysqld.display(),
            data_dir.display()
        ))
        .output()?;

        if !init_output.status.success() {
            return Err(AppError::Build(format!(
                "MySQL initialization failed: {}",
                String::from_utf8_lossy(&init_output.stderr)
            )));
        }

        // Generate my.cnf
        if let Some(ref cb) = on_progress {
            cb(80.0, "Generating configuration...".to_string());
        }

        let my_cnf = install_dir.join("my.cnf");
        std::fs::write(
            &my_cnf,
            include_str!("../../assets/my.cnf.default")
                .replace("{INSTALL_DIR}", &install_dir.display().to_string())
                .replace("{DATA_DIR}", &data_dir.display().to_string()),
        )?;

        // Sign binaries
        PlatformOps::sign_binary(&install_dir.join("bin").join("mysqld"))?;
        PlatformOps::sign_binary(&install_dir.join("bin").join("mysql"))?;

        // Clean up
        let _ = std::fs::remove_file(&archive_path);

        if let Some(ref cb) = on_progress {
            cb(100.0, "Installation complete!".to_string());
        }

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

        let default = self.get_default()?;
        if default.as_deref() == Some(version) {
            for bin in &["mysql", "mysqld", "mysqldump"] {
                let link = self.bin_dir.join(bin);
                if link.exists() {
                    let _ = std::fs::remove_file(&link);
                }
            }
        }

        Ok(())
    }

    fn list_installed(&self) -> Result<Vec<RuntimeVersion>, AppError> {
        Ok(self.load_installed_versions())
    }

    fn switch_default(&self, version: &str) -> Result<(), AppError> {
        let install_dir = self.version_dir(version);
        let mysqld = install_dir.join("bin").join("mysqld");

        if !mysqld.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "mysql".to_string(),
                version: version.to_string(),
            });
        }

        // Create symlinks for all MySQL binaries
        for bin in &["mysql", "mysqld", "mysqldump", "mysqladmin"] {
            let src = install_dir.join("bin").join(bin);
            if src.exists() {
                let link = self.bin_dir.join(bin);
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
