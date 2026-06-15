use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::core::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct PhpExtensionInfo {
    pub name: String,
    pub filename: String,
    pub enabled: bool,
    pub size: String,
}

/// Get the install directory for a PHP version
fn php_dir(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    settings.runtime_dir.join("php").join(version)
}

/// Get the path to php.ini for a specific version
fn php_ini_path(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        php_dir(settings, version).join("php.ini")
    }

    #[cfg(not(target_os = "windows"))]
    {
        php_dir(settings, version).join("lib").join("php.ini")
    }
}

/// Get the extension directory for a PHP version
fn php_ext_dir(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        php_dir(settings, version).join("ext")
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Try to find the extension directory
        let base = php_dir(settings, version)
            .join("lib")
            .join("php")
            .join("extensions");
        if base.exists() {
            // Find the subdirectory (e.g., no-debug-non-zts-20240924)
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        return entry.path();
                    }
                }
            }
        }
        base
    }
}

fn extension_suffix() -> &'static str {
    if cfg!(target_os = "windows") {
        ".dll"
    } else {
        ".so"
    }
}

fn extension_base_name(filename: &str) -> String {
    let mut name = filename
        .strip_suffix(extension_suffix())
        .unwrap_or(filename)
        .to_string();
    if let Some(stripped) = name.strip_prefix("php_") {
        name = stripped.to_string();
    }
    name
}

fn extension_directive(filename: &str) -> &'static str {
    if extension_base_name(filename) == "opcache" {
        "zend_extension"
    } else {
        "extension"
    }
}

fn extension_ini_line(filename: &str) -> String {
    format!("{}={}", extension_directive(filename), filename)
}

fn line_loads_extension(line: &str, filename: &str) -> bool {
    let trimmed = line.trim();
    let name = extension_base_name(filename);
    let directive = extension_directive(filename);
    let direct_match = trimmed.starts_with(&format!("{}=", directive))
        && (trimmed.contains(filename) || trimmed.contains(&name));
    let legacy_opcache_match = name == "opcache"
        && trimmed.starts_with("extension=")
        && (trimmed.contains(filename) || trimmed.contains(&name));

    direct_match || legacy_opcache_match
}

// ── php.ini ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_php_config(
    state: State<'_, AppState>,
    version: String,
) -> Result<String, AppError> {
    let settings = state.settings.lock().await;
    let path = php_ini_path(settings.get(), &version);

    if !path.exists() {
        return Err(AppError::Config(format!(
            "php.ini not found for PHP {}",
            version
        )));
    }

    std::fs::read_to_string(&path).map_err(|e| AppError::Io(e))
}

#[tauri::command]
pub async fn save_php_config(
    state: State<'_, AppState>,
    version: String,
    content: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let path = php_ini_path(settings.get(), &version);

    // Backup before overwriting
    let backup = path.with_extension("php.ini.bak");
    if path.exists() {
        let _ = std::fs::copy(&path, &backup);
    }

    std::fs::write(&path, &content)?;
    Ok(())
}

// ── Extensions ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_php_extensions(
    state: State<'_, AppState>,
    version: String,
) -> Result<Vec<PhpExtensionInfo>, AppError> {
    let settings = state.settings.lock().await;
    let ext_dir = php_ext_dir(settings.get(), &version);
    let ini_path = php_ini_path(settings.get(), &version);

    let ini_content = if ini_path.exists() {
        std::fs::read_to_string(&ini_path).unwrap_or_default()
    } else {
        String::new()
    };

    let mut extensions = Vec::new();

    if ext_dir.exists() {
        for entry in std::fs::read_dir(&ext_dir)? {
            let entry = entry?;
            let path = entry.path();

            // Skip macOS resource fork files (._*) and non-extension files
            let filename = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if filename.starts_with("._") || filename.starts_with("__MACOSX") {
                continue;
            }

            if filename.ends_with(extension_suffix()) {
                // Extract base name (e.g., "opcache.so" or "php_curl.dll" -> "curl")
                let name = extension_base_name(&filename);

                // Check if this extension is enabled in php.ini
                let enabled = ini_content
                    .lines()
                    .any(|line| line_loads_extension(line, &filename));

                let size = path.metadata().map(|m| m.len()).unwrap_or(0);
                let size_str = if size >= 1_048_576 {
                    format!("{:.1} MB", size as f64 / 1_048_576.0)
                } else if size >= 1024 {
                    format!("{:.1} KB", size as f64 / 1024.0)
                } else {
                    format!("{} B", size)
                };

                extensions.push(PhpExtensionInfo {
                    name,
                    filename,
                    enabled,
                    size: size_str,
                });
            }
        }
    }

    extensions.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(extensions)
}

#[tauri::command]
pub async fn toggle_php_extension(
    state: State<'_, AppState>,
    version: String,
    extension_name: String,
    enabled: bool,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let ini_path = php_ini_path(settings.get(), &version);

    let content = if ini_path.exists() {
        std::fs::read_to_string(&ini_path).unwrap_or_default()
    } else {
        String::from("[PHP]\n")
    };

    let ext_line = extension_ini_line(&extension_name);

    let new_content = if enabled {
        // Add the extension line if not already present
        if !content
            .lines()
            .any(|line| line_loads_extension(line, &extension_name))
        {
            format!("{}\n{}", content.trim_end(), ext_line)
        } else {
            content
        }
    } else {
        // Remove the extension line
        content
            .lines()
            .filter(|line| !line_loads_extension(line, &extension_name))
            .collect::<Vec<_>>()
            .join("\n")
    };

    // Backup
    let backup = ini_path.with_extension("php.ini.bak");
    if ini_path.exists() {
        let _ = std::fs::copy(&ini_path, &backup);
    }

    std::fs::write(&ini_path, &new_content)?;
    Ok(())
}

// ── PECL Extension Installation ────────────────────────────────────

/// Popular PECL extensions that developers commonly need
const POPULAR_PECL: &[(&str, &str)] = &[
    ("redis", "Redis client"),
    ("xdebug", "Debugger and profiler"),
    ("imagick", "ImageMagick image processing"),
    ("memcached", "Memcached client"),
    ("mongodb", "MongoDB driver"),
    ("swoole", "High-performance network framework"),
    ("sodium", "Sodium cryptography (often built-in now)"),
    ("apcu", "User cache"),
    ("yaml", "YAML parsing"),
];

#[derive(Debug, Clone, Serialize)]
pub struct PeclExtension {
    pub name: String,
    pub description: String,
    pub installed: bool,
}

#[tauri::command]
pub async fn list_pecl_extensions(
    state: State<'_, AppState>,
    version: String,
) -> Result<Vec<PeclExtension>, AppError> {
    let settings = state.settings.lock().await;
    let ini_path = php_ini_path(settings.get(), &version);
    let ini_content = if ini_path.exists() {
        std::fs::read_to_string(&ini_path).unwrap_or_default()
    } else {
        String::new()
    };

    Ok(POPULAR_PECL
        .iter()
        .map(|(name, desc)| {
            let installed = ini_content
                .lines()
                .any(|l| l.trim().starts_with("extension=") && l.contains(name));
            PeclExtension {
                name: name.to_string(),
                description: desc.to_string(),
                installed,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn install_pecl_extension(
    state: State<'_, AppState>,
    _app: tauri::AppHandle,
    version: String,
    extension_name: String,
) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let _ = state;
        return Err(AppError::DependencyMissing(
            format!(
                "PECL source builds are not supported for Envora managed PHP on Windows yet. Use a prebuilt Windows DLL for {} that matches PHP {} NTS VS17 x64.",
                extension_name, version
            ),
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let settings = state.settings.lock().await;
        let dir = php_dir(settings.get(), &version);

        let phpize_bin = dir.join("bin").join("phpize");
        let php_config_bin = dir.join("bin").join("php-config");
        let pecl_bin = dir.join("bin").join("pecl");
        drop(settings);

        // Check tools exist
        if !phpize_bin.exists() {
            return Err(AppError::DependencyMissing(
                "phpize not found — PHP dev package may be missing".to_string(),
            ));
        }
        if !php_config_bin.exists() {
            return Err(AppError::DependencyMissing(
                "php-config not found — PHP dev package may be missing".to_string(),
            ));
        }

        // pecl might not exist — fall back to phpize + configure + make
        let build_dir = std::path::PathBuf::from("/tmp/envora-pecl").join(&extension_name);
        let _ = std::fs::remove_dir_all(&build_dir);
        std::fs::create_dir_all(&build_dir)?;

        // Try pecl first
        if pecl_bin.exists() {
            let output = crate::core::platform::PlatformOps::shell_command(&format!(
                "cd \"{}\" && \"{}\" install -f \"{}\" 2>&1",
                build_dir.display(),
                pecl_bin.display(),
                extension_name
            ))
            .output()?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Err(AppError::Build(format!(
                    "PECL install failed for {}:\n{}",
                    extension_name,
                    if stderr.is_empty() { stdout } else { stderr }
                )));
            }

            // Add extension line if not already present
            add_extension_to_ini(&dir, &extension_name)?;
            let _ = std::fs::remove_dir_all(&build_dir);
            return Ok(());
        }

        // Fallback: check if we can find the extension source and compile manually
        Err(AppError::DependencyMissing(format!(
            "pecl not found. Install phpize and php-config first, then run:\npecl install {}",
            extension_name
        )))
    }
}

fn add_extension_to_ini(install_dir: &std::path::Path, ext_name: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    let ini_path = install_dir.join("php.ini");
    #[cfg(not(target_os = "windows"))]
    let ini_path = install_dir.join("lib").join("php.ini");

    let content = if ini_path.exists() {
        std::fs::read_to_string(&ini_path).unwrap_or_default()
    } else {
        String::from("[PHP]\n")
    };

    let ext_line = format!("extension={}", ext_name);

    if !content.lines().any(|l| l.trim() == ext_line) {
        let new_content = format!("{}\n{}", content.trim_end(), ext_line);
        std::fs::write(&ini_path, &new_content)?;
    }

    Ok(())
}

// ── php-fpm.conf ───────────────────────────────────────────────────

#[tauri::command]
pub async fn get_php_fpm_config(
    state: State<'_, AppState>,
    version: String,
) -> Result<String, AppError> {
    let settings = state.settings.lock().await;
    let path = php_dir(settings.get(), &version)
        .join("etc")
        .join("php-fpm.conf");

    if !path.exists() {
        return Err(AppError::Config(format!(
            "php-fpm.conf not found for PHP {}",
            version
        )));
    }

    std::fs::read_to_string(&path).map_err(|e| AppError::Io(e))
}

#[tauri::command]
pub async fn save_php_fpm_config(
    state: State<'_, AppState>,
    version: String,
    content: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let path = php_dir(settings.get(), &version)
        .join("etc")
        .join("php-fpm.conf");

    let backup = path.with_extension("php-fpm.conf.bak");
    if path.exists() {
        let _ = std::fs::copy(&path, &backup);
    }

    std::fs::write(&path, &content)?;
    Ok(())
}
