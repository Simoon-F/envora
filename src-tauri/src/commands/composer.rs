use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::AppError;
use crate::state::AppState;

const COMPOSER_URL: &str = "https://getcomposer.org/download/latest-stable/composer.phar";

#[derive(Debug, Clone, Serialize)]
pub struct ComposerInfo {
    pub envora_installed: bool,
    pub envora_path: String,
    pub envora_version: Option<String>,
    pub system_available: bool,
    pub system_version: Option<String>,
    pub php_path: Option<String>,
    pub php_version: Option<String>,
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

fn run_composer(
    composer_phar: &Path,
    php: Option<&Path>,
    args: &[String],
    cwd: Option<&Path>,
) -> Result<ComposerCommandResult, AppError> {
    let mut command = if composer_phar.exists() {
        let php = php.ok_or_else(|| {
            AppError::DependencyMissing(
                "PHP is required to run Envora managed composer.phar. Install PHP first."
                    .to_string(),
            )
        })?;
        let mut command = Command::new(php);
        command.arg(composer_phar);
        command
    } else {
        Command::new("composer")
    };

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
    let envora_installed = composer_phar.exists();

    let envora_version = if envora_installed {
        let args = vec!["--version".to_string(), "--no-ansi".to_string()];
        run_composer(&composer_phar, php.as_deref(), &args, None)
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
            command.arg("-v");
            command
        })
        .ok()
        .and_then(|result| version_from_output(&result.stdout))
    } else {
        None
    };

    Ok(ComposerInfo {
        envora_installed,
        envora_path: composer_phar.display().to_string(),
        envora_version,
        system_available,
        system_version,
        php_path: php.as_ref().map(|p| p.display().to_string()),
        php_version,
    })
}

#[tauri::command]
pub async fn install_composer(state: State<'_, AppState>) -> Result<(), AppError> {
    let target = composer_phar_path(&state);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let bytes = reqwest::get(COMPOSER_URL).await?.bytes().await?;
    std::fs::write(&target, bytes)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&target)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&target, permissions)?;
    }

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
    let args = vec!["self-update".to_string(), "--no-ansi".to_string()];
    run_composer(&composer_phar, php.as_deref(), &args, None)
}

#[tauri::command]
pub async fn get_composer_config(
    state: State<'_, AppState>,
) -> Result<Vec<ComposerConfigEntry>, AppError> {
    let settings = state.settings.lock().await;
    let php = php_binary(settings.get(), None);
    drop(settings);

    let composer_phar = composer_phar_path(&state);
    let args = vec![
        "config".to_string(),
        "--global".to_string(),
        "--list".to_string(),
        "--no-ansi".to_string(),
    ];
    let result = run_composer(&composer_phar, php.as_deref(), &args, None)?;
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

    run_composer(&composer_phar, php.as_deref(), &args, None)
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
    run_composer(
        &composer_phar,
        php.as_deref(),
        &request.args,
        Some(&project_dir),
    )
}
