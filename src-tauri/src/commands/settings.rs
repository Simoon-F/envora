#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::process::Command;

use tauri::State;

use crate::core::AppError;
use crate::settings::manager::AppSettings;
use crate::state::AppState;

const ENVORA_PROFILE_BEGIN: &str = "# >>> envora >>>";
const ENVORA_PROFILE_END: &str = "# <<< envora <<<";

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShellEnvironmentStatus {
    pub bin_dir: String,
    pub env_script: String,
    pub shell_profile: String,
    pub is_installed: bool,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
    let settings = state.settings.lock().await;
    Ok(settings.get().clone())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    theme: Option<String>,
    auto_start: Option<bool>,
) -> Result<AppSettings, AppError> {
    let mut settings = state.settings.lock().await;

    settings.update(|s| {
        if let Some(theme) = theme {
            s.theme = match theme.as_str() {
                "light" => crate::settings::manager::Theme::Light,
                "dark" => crate::settings::manager::Theme::Dark,
                _ => crate::settings::manager::Theme::System,
            };
        }
        if let Some(auto_start) = auto_start {
            s.auto_start_services = auto_start;
        }
    })?;

    Ok(settings.get().clone())
}

#[tauri::command]
pub async fn get_shell_environment_status(
    state: State<'_, AppState>,
) -> Result<ShellEnvironmentStatus, AppError> {
    let profile = shell_profile_path()?;
    let is_installed = profile
        .exists()
        .then(|| std::fs::read_to_string(&profile).ok())
        .flatten()
        .map(|content| content.contains(ENVORA_PROFILE_BEGIN))
        .unwrap_or(false);

    Ok(ShellEnvironmentStatus {
        bin_dir: state.bin_dir().display().to_string(),
        env_script: env_script_path(&state).display().to_string(),
        shell_profile: profile.display().to_string(),
        is_installed,
    })
}

#[tauri::command]
pub async fn install_shell_environment(
    state: State<'_, AppState>,
) -> Result<ShellEnvironmentStatus, AppError> {
    ensure_shell_environment(&state)?;
    get_shell_environment_status(state).await
}

pub(crate) fn ensure_shell_environment(state: &AppState) -> Result<(), AppError> {
    let bin_dir = state.bin_dir();
    let composer_dir = state.data_dir.join("composer");
    std::fs::create_dir_all(&bin_dir)?;
    std::fs::create_dir_all(&composer_dir)?;
    std::fs::create_dir_all(composer_dir.join("cache"))?;
    if bin_dir.join("composer.phar").exists() {
        crate::commands::composer::write_composer_launcher(&state)?;
    }

    let env_script = env_script_path(&state);
    if let Some(parent) = env_script.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &env_script,
        shell_env_script(&state.data_dir.display().to_string()),
    )?;

    #[cfg(windows)]
    install_windows_system_path(&bin_dir)?;

    let profile = shell_profile_path()?;
    if let Some(parent) = profile.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let source_block = profile_source_block(&env_script.display().to_string());
    let current = if profile.exists() {
        std::fs::read_to_string(&profile)?
    } else {
        String::new()
    };
    let next = replace_or_append_profile_block(&current, &source_block);
    std::fs::write(&profile, next)?;

    Ok(())
}

fn env_script_path(state: &AppState) -> std::path::PathBuf {
    #[cfg(windows)]
    {
        return state.data_dir.join("env.ps1");
    }

    #[cfg(not(windows))]
    {
        state.data_dir.join("env.sh")
    }
}

fn shell_profile_path() -> Result<std::path::PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Config("Unable to locate home directory".to_string()))?;

    #[cfg(windows)]
    {
        return Ok(home
            .join("Documents")
            .join("PowerShell")
            .join("Microsoft.PowerShell_profile.ps1"));
    }

    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_default();
        if shell.ends_with("bash") {
            Ok(home.join(".bashrc"))
        } else if shell.ends_with("fish") {
            Ok(home.join(".config").join("fish").join("config.fish"))
        } else {
            Ok(home.join(".zshrc"))
        }
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn shell_env_script(data_dir: &str) -> String {
    #[cfg(windows)]
    {
        let home = powershell_quote(data_dir);
        return format!(
            "# Envora shell environment\n\
             $env:ENVORA_HOME = {home}\n\
             $env:ENVORA_BIN = Join-Path $env:ENVORA_HOME 'bin'\n\
             if (($env:Path -split ';') -notcontains $env:ENVORA_BIN) {{\n\
             \x20 $env:Path = \"$env:ENVORA_BIN;$env:Path\"\n\
             }}\n\
             $env:COMPOSER_HOME = Join-Path $env:ENVORA_HOME 'composer'\n\
             $env:COMPOSER_CACHE_DIR = Join-Path $env:COMPOSER_HOME 'cache'\n"
        );
    }

    #[cfg(not(windows))]
    {
        let home = shell_quote(data_dir);
        format!(
            "# Envora shell environment\n\
         export ENVORA_HOME={home}\n\
         export ENVORA_BIN=\"$ENVORA_HOME/bin\"\n\
         case \":$PATH:\" in\n\
         \x20 *\":$ENVORA_BIN:\"*) ;;\n\
         \x20 *) export PATH=\"$ENVORA_BIN:$PATH\" ;;\n\
         esac\n\
         export COMPOSER_HOME=\"$ENVORA_HOME/composer\"\n\
         export COMPOSER_CACHE_DIR=\"$ENVORA_HOME/composer/cache\"\n"
        )
    }
}

fn profile_source_block(env_script: &str) -> String {
    #[cfg(windows)]
    {
        let quoted = powershell_quote(env_script);
        return format!(
            "{ENVORA_PROFILE_BEGIN}\n\
             if (Test-Path {quoted}) {{ . {quoted} }}\n\
             {ENVORA_PROFILE_END}\n"
        );
    }

    #[cfg(not(windows))]
    {
        let quoted = shell_quote(env_script);
        format!(
            "{ENVORA_PROFILE_BEGIN}\n\
         [ -f {quoted} ] && . {quoted}\n\
         {ENVORA_PROFILE_END}\n"
        )
    }
}

fn replace_or_append_profile_block(current: &str, block: &str) -> String {
    if let Some(start) = current.find(ENVORA_PROFILE_BEGIN) {
        if let Some(end_rel) = current[start..].find(ENVORA_PROFILE_END) {
            let end = start + end_rel + ENVORA_PROFILE_END.len();
            let mut next = String::new();
            next.push_str(current[..start].trim_end());
            next.push_str("\n\n");
            next.push_str(block.trim_end());
            next.push_str("\n");
            next.push_str(current[end..].trim_start_matches(['\r', '\n']));
            return next;
        }
    }

    let mut next = current.trim_end().to_string();
    if !next.is_empty() {
        next.push_str("\n\n");
    }
    next.push_str(block);
    next
}

#[cfg(windows)]
fn install_windows_system_path(bin_dir: &Path) -> Result<(), AppError> {
    let bin = powershell_quote(&bin_dir.display().to_string());
    let script = format!(
        "$bin = {bin}; \
         $path = [Environment]::GetEnvironmentVariable('Path', 'Machine'); \
         if ([string]::IsNullOrEmpty($path)) {{ \
         \x20 [Environment]::SetEnvironmentVariable('Path', $bin, 'Machine') \
         }} elseif (($path -split ';') -notcontains $bin) {{ \
         \x20 [Environment]::SetEnvironmentVariable('Path', \"$bin;$path\", 'Machine') \
         }}"
    );

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()?;

    if !output.status.success() {
        return Err(AppError::Other(format!(
            "Failed to update system PATH. Please run Envora as administrator: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}
