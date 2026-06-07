use std::path::PathBuf;

use async_trait::async_trait;

use super::provider::*;
use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::download::extractor::ArchiveExtractor;
use crate::download::manager::DownloadManager;

const NGINX_VERSIONS: &[(&str, &str)] = &[
    ("1.26.2", "https://nginx.org/download/nginx-1.26.2.tar.gz"),
    ("1.27.3", "https://nginx.org/download/nginx-1.27.3.tar.gz"),
];

pub struct NginxProvider {
    runtime_dir: PathBuf,
    bin_dir: PathBuf,
}

impl NginxProvider {
    pub fn new(runtime_dir: PathBuf, bin_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            bin_dir,
        }
    }

    fn nginx_dir(&self) -> PathBuf {
        self.runtime_dir.join("nginx")
    }

    fn version_dir(&self, version: &str) -> PathBuf {
        self.nginx_dir().join(version)
    }

    fn versions_file(&self) -> PathBuf {
        self.nginx_dir().join("versions.json")
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
        std::fs::create_dir_all(self.nginx_dir())?;
        std::fs::write(self.versions_file(), content)?;
        Ok(())
    }
}

#[async_trait]
impl RuntimeProvider for NginxProvider {
    fn runtime_type(&self) -> RuntimeType {
        RuntimeType::Nginx
    }

    async fn available_versions(&self) -> Result<Vec<VersionInfo>, AppError> {
        let installed = self.list_installed()?;
        let default = self.get_default()?;

        Ok(NGINX_VERSIONS
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
        let url = NGINX_VERSIONS
            .iter()
            .find(|(v, _)| *v == version)
            .map(|(_, url)| *url)
            .ok_or_else(|| AppError::VersionNotFound {
                runtime: "nginx".to_string(),
                version: version.to_string(),
            })?;

        let install_dir = self.version_dir(version);
        std::fs::create_dir_all(&install_dir)?;

        // Download
        if let Some(ref cb) = on_progress {
            cb(0.0, "Downloading Nginx source...".to_string());
        }

        let archive_path = install_dir.join(format!("nginx-{}.tar.gz", version));
        DownloadManager::download(url, &archive_path, None).await?;

        // Extract
        if let Some(ref cb) = on_progress {
            cb(20.0, "Extracting archive...".to_string());
        }

        let extract_dir = install_dir.join("src");
        std::fs::create_dir_all(&extract_dir)?;
        ArchiveExtractor::extract(&archive_path, &extract_dir)?;

        let source_dir = extract_dir
            .read_dir()?
            .filter_map(|e| e.ok())
            .find(|e| e.path().is_dir())
            .map(|e| e.path())
            .unwrap_or(extract_dir.clone());

        // Configure
        if let Some(ref cb) = on_progress {
            cb(30.0, "Configuring...".to_string());
        }

        let configure_output = PlatformOps::shell_command(&format!(
            "cd \"{}\" && env -i HOME=/tmp TMPDIR=/tmp PATH=\"/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin\" ./configure --prefix=\"{}\" --with-http_ssl_module --with-http_v2_module --with-http_realip_module",
            source_dir.display(),
            install_dir.display()
        ))
        .output()?;

        if !configure_output.status.success() {
            return Err(AppError::Build(format!(
                "Configure failed: {}",
                String::from_utf8_lossy(&configure_output.stderr)
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
            return Err(AppError::Build(format!(
                "Make failed: {}",
                String::from_utf8_lossy(&make_output.stderr)
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
            return Err(AppError::Build(format!(
                "Make install failed: {}",
                String::from_utf8_lossy(&install_output.stderr)
            )));
        }

        // Generate nginx.conf
        if let Some(ref cb) = on_progress {
            cb(90.0, "Generating configuration...".to_string());
        }

        let conf_dir = install_dir.join("conf");
        let nginx_conf = conf_dir.join("nginx.conf");
        if !nginx_conf.exists() {
            std::fs::write(
                &nginx_conf,
                include_str!("../../assets/nginx.conf.default")
                    .replace("{INSTALL_DIR}", &install_dir.display().to_string()),
            )?;
        }

        // Sign binary
        PlatformOps::sign_binary(&install_dir.join("sbin").join("nginx"))?;

        // Clean up
        let _ = std::fs::remove_dir_all(&extract_dir);
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
            let link = self.bin_dir.join("nginx");
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
        let nginx_bin = install_dir.join("sbin").join("nginx");

        if !nginx_bin.exists() {
            return Err(AppError::VersionNotFound {
                runtime: "nginx".to_string(),
                version: version.to_string(),
            });
        }

        let link = self.bin_dir.join("nginx");
        PlatformOps::create_link(&nginx_bin, &link)?;

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
