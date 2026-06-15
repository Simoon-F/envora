use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::event::emit_progress;
use crate::core::{AppError, BuildStage, EventPayload};
use crate::state::AppState;

const COMPOSER_URL: &str = "https://getcomposer.org/download/latest-stable/composer.phar";

#[derive(Debug, Clone, Serialize)]
pub struct ComposerInfo {
    pub envora_installed: bool,
    pub envora_path: String,
    pub envora_cache_dir: String,
    pub envora_version: Option<String>,
    pub system_available: bool,
    pub system_version: Option<String>,
    pub php_path: Option<String>,
    pub php_version: Option<String>,
    pub php_ini_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ComposerConfigEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ComposerCommandResult {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerCommandRequest {
    pub project_dir: String,
    pub php_version: Option<String>,
    pub args: Vec<String>,
}

fn composer_phar_path(state: &AppState) -> PathBuf {
    state.bin_dir().join("composer.phar")
}

fn composer_home_path(state: &AppState) -> PathBuf {
    state.data_dir.join("composer")
}

fn composer_cache_path(state: &AppState) -> PathBuf {
    composer_home_path(state).join("cache")
}

fn composer_launcher_path(state: &AppState) -> PathBuf {
    state.bin_dir().join(if cfg!(windows) {
        "composer.bat"
    } else {
        "composer"
    })
}

pub(crate) fn write_composer_launcher(state: &AppState) -> Result<(), AppError> {
    let launcher = composer_launcher_path(state);
    if let Some(parent) = launcher.parent() {
        std::fs::create_dir_all(parent)?;
    }

    #[cfg(windows)]
    {
        let content = format!(
            "@echo off\r\n\
             set DIR=%~dp0\r\n\
             if exist \"%DIR%php.cmd\" (\r\n\
             \x20 call \"%DIR%php.cmd\" \"%DIR%composer.phar\" %*\r\n\
             ) else (\r\n\
             \x20 php \"%DIR%composer.phar\" %*\r\n\
             )\r\n"
        );
        std::fs::write(&launcher, content)?;
    }

    #[cfg(not(windows))]
    {
        let content = "#!/bin/sh\n\
            set -e\n\
            DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\n\
            PHP_BIN=\"$DIR/php\"\n\
            if [ ! -x \"$PHP_BIN\" ]; then\n\
            \x20 PHP_BIN=$(command -v php || true)\n\
            fi\n\
            if [ -z \"$PHP_BIN\" ]; then\n\
            \x20 echo \"PHP is required to run Composer. Install PHP in Envora first.\" >&2\n\
            \x20 exit 127\n\
            fi\n\
            exec \"$PHP_BIN\" \"$DIR/composer.phar\" \"$@\"\n";
        std::fs::write(&launcher, content)?;

        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&launcher)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&launcher, permissions)?;
    }

    Ok(())
}

fn php_binary(
    settings: &crate::settings::manager::AppSettings,
    version: Option<&str>,
) -> Option<PathBuf> {
    let selected = version
        .map(|v| v.to_string())
        .or_else(|| settings.default_versions.get("php").cloned());

    if let Some(version) = selected {
        let binary = settings
            .runtime_dir
            .join("php")
            .join(version)
            .join("bin")
            .join("php");
        if binary.exists() {
            return Some(binary);
        }
    }

    let linked = settings.bin_dir.join("php");
    if linked.exists() {
        return Some(linked);
    }

    None
}

fn php_install_dir_from_binary(php: &Path) -> Option<PathBuf> {
    if php.file_name()?.to_string_lossy() != "php" {
        return None;
    }

    let bin_dir = php.parent()?;
    if bin_dir.file_name()?.to_string_lossy() != "bin" {
        return None;
    }

    bin_dir.parent().map(|p| p.to_path_buf())
}

fn apply_php_ini_env(command: &mut Command, php: &Path) {
    if let Some(install_dir) = php_install_dir_from_binary(php) {
        command.env("PHPRC", install_dir.join("lib"));
        command.env("PHP_INI_SCAN_DIR", install_dir.join("etc").join("conf.d"));
    }
}

fn command_output(mut command: Command) -> Result<ComposerCommandResult, AppError> {
    let output = command.output()?;
    Ok(ComposerCommandResult {
        status: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn version_from_output(text: &str) -> Option<String> {
    text.lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
}

fn loaded_php_ini_path(php: &Path) -> Option<String> {
    let result = command_output({
        let mut command = Command::new(php);
        apply_php_ini_env(&mut command, php);
        command.arg("--ini");
        command
    })
    .ok()?;

    let output = format!("{}\n{}", result.stdout, result.stderr);
    output.lines().find_map(|line| {
        let value = line
            .trim()
            .strip_prefix("Loaded Configuration File:")?
            .trim();
        if value.is_empty() || value == "(none)" {
            None
        } else {
            Some(value.to_string())
        }
    })
}

fn run_composer(
    composer_phar: &Path,
    composer_home: &Path,
    composer_cache: &Path,
    php: Option<&Path>,
    args: &[String],
    cwd: Option<&Path>,
) -> Result<ComposerCommandResult, AppError> {
    std::fs::create_dir_all(composer_home)?;
    std::fs::create_dir_all(composer_cache)?;

    let mut command = if composer_phar.exists() {
        let php = php.ok_or_else(|| {
            AppError::DependencyMissing(
                "PHP is required to run Envora managed composer.phar. Install PHP first."
                    .to_string(),
            )
        })?;
        let mut command = Command::new(php);
        apply_php_ini_env(&mut command, php);
        command.arg(composer_phar);
        command
    } else {
        Command::new("composer")
    };

    command.env("COMPOSER_HOME", composer_home);
    command.env("COMPOSER_CACHE_DIR", composer_cache);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    command_output(command)
}

fn parse_composer_config(text: &str) -> Vec<ComposerConfigEntry> {
    text.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with('[') {
                return None;
            }
            let end = trimmed.find(']')?;
            let key = trimmed[1..end].trim();
            let value = trimmed[end + 1..].trim();
            if key.is_empty() {
                return None;
            }
            Some(ComposerConfigEntry {
                key: key.to_string(),
                value: value.to_string(),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn get_composer_info(state: State<'_, AppState>) -> Result<ComposerInfo, AppError> {
    let settings = state.settings.lock().await;
    let php = php_binary(settings.get(), None);
    drop(settings);

    let composer_phar = composer_phar_path(&state);
    let composer_home = composer_home_path(&state);
    let composer_cache = composer_cache_path(&state);
    let envora_installed = composer_phar.exists();

    let envora_version = if envora_installed {
        let args = vec!["--version".to_string(), "--no-ansi".to_string()];
        run_composer(
            &composer_phar,
            &composer_home,
            &composer_cache,
            php.as_deref(),
            &args,
            None,
        )
        .ok()
        .and_then(|result| version_from_output(&result.stdout))
    } else {
        None
    };

    let system_result = command_output({
        let mut command = Command::new("composer");
        command.args(["--version", "--no-ansi"]);
        command
    });

    let (system_available, system_version) = match system_result {
        Ok(result) if result.status == 0 => (true, version_from_output(&result.stdout)),
        _ => (false, None),
    };

    let php_version = if let Some(ref php_path) = php {
        command_output({
            let mut command = Command::new(php_path);
            apply_php_ini_env(&mut command, php_path);
            command.arg("-v");
            command
        })
        .ok()
        .and_then(|result| version_from_output(&result.stdout))
    } else {
        None
    };

    let php_ini_path = php.as_deref().and_then(loaded_php_ini_path);

    Ok(ComposerInfo {
        envora_installed,
        envora_path: composer_phar.display().to_string(),
        envora_cache_dir: composer_cache.display().to_string(),
        envora_version,
        system_available,
        system_version,
        php_path: php.as_ref().map(|p| p.display().to_string()),
        php_version,
        php_ini_path,
    })
}

#[tauri::command]
pub async fn install_composer(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let target = composer_phar_path(&state);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::create_dir_all(composer_home_path(&state))?;
    std::fs::create_dir_all(composer_cache_path(&state))?;

    emit_progress(
        &app,
        &EventPayload::BuildProgress {
            runtime: "composer".to_string(),
            version: "latest".to_string(),
            stage: BuildStage::Downloading,
            message: "准备下载 Composer...".to_string(),
            percent: 0.0,
        },
    );

    let response = reqwest::get(COMPOSER_URL).await?.error_for_status()?;
    let total = response.content_length().unwrap_or(0);
    let mut downloaded = 0_u64;
    let temp_target = target.with_extension("phar.download");
    let mut file = std::fs::File::create(&temp_target)?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;

        let percent = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };
        let message = if total > 0 {
            format!(
                "下载中... {:.0}% ({:.1} / {:.1} MB)",
                percent,
                downloaded as f64 / 1_048_576.0,
                total as f64 / 1_048_576.0
            )
        } else {
            format!("下载中... {:.1} MB", downloaded as f64 / 1_048_576.0)
        };

        emit_progress(
            &app,
            &EventPayload::BuildProgress {
                runtime: "composer".to_string(),
                version: "latest".to_string(),
                stage: BuildStage::Downloading,
                message,
                percent,
            },
        );
    }
    file.flush()?;
    drop(file);
    std::fs::rename(&temp_target, &target)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&target)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&target, permissions)?;
    }

    write_composer_launcher(&state)?;
    crate::commands::settings::ensure_shell_environment(&state).await?;

    emit_progress(
        &app,
        &EventPayload::BuildProgress {
            runtime: "composer".to_string(),
            version: "latest".to_string(),
            stage: BuildStage::Installing,
            message: "Composer 已安装。".to_string(),
            percent: 100.0,
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn update_composer(
    state: State<'_, AppState>,
) -> Result<ComposerCommandResult, AppError> {
    let settings = state.settings.lock().await;
    let php = php_binary(settings.get(), None);
    drop(settings);

    let composer_phar = composer_phar_path(&state);
    let composer_home = composer_home_path(&state);
    let composer_cache = composer_cache_path(&state);
    let args = vec!["self-update".to_string(), "--no-ansi".to_string()];
    run_composer(
        &composer_phar,
        &composer_home,
        &composer_cache,
        php.as_deref(),
        &args,
        None,
    )
}

#[tauri::command]
pub async fn get_composer_config(
    state: State<'_, AppState>,
) -> Result<Vec<ComposerConfigEntry>, AppError> {
    let settings = state.settings.lock().await;
    let php = php_binary(settings.get(), None);
    drop(settings);

    let composer_phar = composer_phar_path(&state);
    let composer_home = composer_home_path(&state);
    let composer_cache = composer_cache_path(&state);
    let args = vec![
        "config".to_string(),
        "--global".to_string(),
        "--list".to_string(),
        "--no-ansi".to_string(),
    ];
    let result = run_composer(
        &composer_phar,
        &composer_home,
        &composer_cache,
        php.as_deref(),
        &args,
        None,
    )?;
    if result.status != 0 {
        return Err(AppError::Other(format!(
            "Composer config failed: {}",
            result.stderr.trim()
        )));
    }

    Ok(parse_composer_config(&result.stdout))
}

#[tauri::command]
pub async fn set_composer_config(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<ComposerCommandResult, AppError> {
    let settings = state.settings.lock().await;
    let php = php_binary(settings.get(), None);
    drop(settings);

    let composer_phar = composer_phar_path(&state);
    let composer_home = composer_home_path(&state);
    let composer_cache = composer_cache_path(&state);
    let args = if key == "repo.packagist" {
        vec![
            "config".to_string(),
            "--global".to_string(),
            "repo.packagist".to_string(),
            "composer".to_string(),
            value,
            "--no-ansi".to_string(),
        ]
    } else {
        vec![
            "config".to_string(),
            "--global".to_string(),
            key,
            value,
            "--no-ansi".to_string(),
        ]
    };

    run_composer(
        &composer_phar,
        &composer_home,
        &composer_cache,
        php.as_deref(),
        &args,
        None,
    )
}

#[tauri::command]
pub async fn run_composer_command(
    state: State<'_, AppState>,
    request: ComposerCommandRequest,
) -> Result<ComposerCommandResult, AppError> {
    let project_dir = PathBuf::from(&request.project_dir);
    if !project_dir.exists() || !project_dir.is_dir() {
        return Err(AppError::Config(format!(
            "Project directory does not exist: {}",
            request.project_dir
        )));
    }

    let settings = state.settings.lock().await;
    let php = php_binary(settings.get(), request.php_version.as_deref());
    drop(settings);

    let composer_phar = composer_phar_path(&state);
    let composer_home = composer_home_path(&state);
    let composer_cache = composer_cache_path(&state);
    run_composer(
        &composer_phar,
        &composer_home,
        &composer_cache,
        php.as_deref(),
        &request.args,
        Some(&project_dir),
    )
}
