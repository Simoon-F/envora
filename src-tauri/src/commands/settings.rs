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
    pub profile_installed: bool,
    pub user_path_installed: bool,
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
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    let profiles = shell_profile_paths()?;
    let profile_installed = profiles.iter().any(profile_contains_envora_block);
    let user_path_installed = user_path_contains_bin_dir(&settings.bin_dir)?;
    let is_installed = if cfg!(windows) {
        profile_installed && user_path_installed
    } else {
        profile_installed
    };

    Ok(ShellEnvironmentStatus {
        bin_dir: settings.bin_dir.display().to_string(),
        env_script: env_script_path(&settings).display().to_string(),
        shell_profile: profiles
            .iter()
            .map(|profile| profile.display().to_string())
            .collect::<Vec<_>>()
            .join("; "),
        profile_installed,
        user_path_installed,
        is_installed,
    })
}

#[tauri::command]
pub async fn install_shell_environment(
    state: State<'_, AppState>,
) -> Result<ShellEnvironmentStatus, AppError> {
    ensure_shell_environment(&state).await?;
    get_shell_environment_status(state).await
}

pub(crate) async fn ensure_shell_environment(state: &AppState) -> Result<(), AppError> {
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    let bin_dir = settings.bin_dir.clone();
    let data_dir = settings.data_dir.clone();
    let composer_dir = data_dir.join("composer");
    let go_dir = data_dir.join("go");
    let go_env = go_dir.join("env");
    let go_tools_bin = data_dir.join("go-tools").join("bin");
    std::fs::create_dir_all(&bin_dir)?;
    std::fs::create_dir_all(&composer_dir)?;
    std::fs::create_dir_all(composer_dir.join("cache"))?;
    std::fs::create_dir_all(&go_dir)?;
    std::fs::create_dir_all(&go_tools_bin)?;
    if !go_env.exists() {
        std::fs::write(&go_env, "")?;
    }
    if bin_dir.join("composer.phar").exists() {
        crate::commands::composer::write_composer_launcher(&state)?;
    }

    let env_script = env_script_path(&settings);
    if let Some(parent) = env_script.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &env_script,
        shell_env_script(&data_dir.display().to_string()),
    )?;

    #[cfg(windows)]
    install_windows_user_path(&bin_dir)?;

    let source_block = profile_source_block(&env_script.display().to_string());
    for profile in shell_profile_paths()? {
        if let Some(parent) = profile.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let current = if profile.exists() {
            std::fs::read_to_string(&profile)?
        } else {
            String::new()
        };
        let next = replace_or_append_profile_block(&current, &source_block);
        std::fs::write(&profile, next)?;
    }

    Ok(())
}

fn env_script_path(settings: &AppSettings) -> std::path::PathBuf {
    #[cfg(windows)]
    {
        settings.data_dir.join("env.ps1")
    }

    #[cfg(not(windows))]
    {
        settings.data_dir.join("env.sh")
    }
}

fn shell_profile_paths() -> Result<Vec<std::path::PathBuf>, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Config("Unable to locate home directory".to_string()))?;

    #[cfg(windows)]
    {
        let powershell_dir = home.join("Documents").join("PowerShell");
        let windows_powershell_dir = home.join("Documents").join("WindowsPowerShell");
        Ok(vec![
            powershell_dir.join("Microsoft.PowerShell_profile.ps1"),
            powershell_dir.join("Microsoft.VSCode_profile.ps1"),
            powershell_dir.join("profile.ps1"),
            windows_powershell_dir.join("Microsoft.PowerShell_profile.ps1"),
            windows_powershell_dir.join("Microsoft.VSCode_profile.ps1"),
            windows_powershell_dir.join("profile.ps1"),
        ])
    }

    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_default();
        if shell.ends_with("bash") {
            Ok(vec![home.join(".bashrc")])
        } else if shell.ends_with("fish") {
            Ok(vec![home.join(".config").join("fish").join("config.fish")])
        } else {
            Ok(vec![home.join(".zshrc")])
        }
    }
}

fn profile_contains_envora_block(profile: &std::path::PathBuf) -> bool {
    profile
        .exists()
        .then(|| std::fs::read_to_string(profile).ok())
        .flatten()
        .map(|content| content.contains(ENVORA_PROFILE_BEGIN))
        .unwrap_or(false)
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
        format!(
            "# Envora shell environment\n\
             $env:ENVORA_HOME = {home}\n\
             $env:ENVORA_BIN = Join-Path $env:ENVORA_HOME 'bin'\n\
             $env:ENVORA_GOENV = Join-Path $env:ENVORA_HOME 'go\\env'\n\
             $env:ENVORA_GO_TOOLS_BIN = Join-Path $env:ENVORA_HOME 'go-tools\\bin'\n\
             $env:GOENV = $env:ENVORA_GOENV\n\
             if (($env:Path -split ';') -notcontains $env:ENVORA_BIN) {{\n\
             \x20 $env:Path = \"$env:ENVORA_BIN;$env:Path\"\n\
             }}\n\
             if (($env:Path -split ';') -notcontains $env:ENVORA_GO_TOOLS_BIN) {{\n\
             \x20 $env:Path = \"$env:ENVORA_GO_TOOLS_BIN;$env:Path\"\n\
             }}\n\
             $env:COMPOSER_HOME = Join-Path $env:ENVORA_HOME 'composer'\n\
             $env:COMPOSER_CACHE_DIR = Join-Path $env:COMPOSER_HOME 'cache'\n\
             $env:ENVORA_JAVA_HOME_FILE = Join-Path $env:ENVORA_HOME 'runtimes\\java\\default_home'\n\
             if (Test-Path $env:ENVORA_JAVA_HOME_FILE) {{\n\
             \x20 $env:JAVA_HOME = (Get-Content -Raw $env:ENVORA_JAVA_HOME_FILE).Trim()\n\
             }}\n\
             $env:ENVORA_GOROOT_FILE = Join-Path $env:ENVORA_HOME 'runtimes\\go\\default_home'\n\
             if (Test-Path $env:ENVORA_GOROOT_FILE) {{\n\
             \x20 $env:GOROOT = (Get-Content -Raw $env:ENVORA_GOROOT_FILE).Trim()\n\
             }}\n"
        )
    }

    #[cfg(not(windows))]
    {
        let home = shell_quote(data_dir);
        format!(
            "# Envora shell environment\n\
         export ENVORA_HOME={home}\n\
         export ENVORA_BIN=\"$ENVORA_HOME/bin\"\n\
         export ENVORA_GOENV=\"$ENVORA_HOME/go/env\"\n\
         export ENVORA_GO_TOOLS_BIN=\"$ENVORA_HOME/go-tools/bin\"\n\
         export GOENV=\"$ENVORA_GOENV\"\n\
         case \":$PATH:\" in\n\
         \x20 *\":$ENVORA_BIN:\"*) ;;\n\
         \x20 *) export PATH=\"$ENVORA_BIN:$PATH\" ;;\n\
         esac\n\
         case \":$PATH:\" in\n\
         \x20 *\":$ENVORA_GO_TOOLS_BIN:\"*) ;;\n\
         \x20 *) export PATH=\"$ENVORA_GO_TOOLS_BIN:$PATH\" ;;\n\
         esac\n\
         export COMPOSER_HOME=\"$ENVORA_HOME/composer\"\n\
         export COMPOSER_CACHE_DIR=\"$ENVORA_HOME/composer/cache\"\n\
         export ENVORA_JAVA_HOME_FILE=\"$ENVORA_HOME/runtimes/java/default_home\"\n\
         if [ -f \"$ENVORA_JAVA_HOME_FILE\" ]; then\n\
         \x20 export JAVA_HOME=\"$(cat \"$ENVORA_JAVA_HOME_FILE\")\"\n\
         fi\n\
         export ENVORA_GOROOT_FILE=\"$ENVORA_HOME/runtimes/go/default_home\"\n\
         if [ -f \"$ENVORA_GOROOT_FILE\" ]; then\n\
         \x20 export GOROOT=\"$(cat \"$ENVORA_GOROOT_FILE\")\"\n\
         fi\n"
        )
    }
}

fn profile_source_block(env_script: &str) -> String {
    #[cfg(windows)]
    {
        let quoted = powershell_quote(env_script);
        format!(
            "{ENVORA_PROFILE_BEGIN}\n\
             if (Test-Path {quoted}) {{ . {quoted} }}\n\
             {ENVORA_PROFILE_END}\n"
        )
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

fn user_path_contains_bin_dir(bin_dir: &std::path::Path) -> Result<bool, AppError> {
    #[cfg(windows)]
    {
        windows_user_path_contains(bin_dir)
    }

    #[cfg(not(windows))]
    {
        let _ = bin_dir;
        Ok(false)
    }
}

#[cfg(windows)]
fn install_windows_user_path(bin_dir: &Path) -> Result<(), AppError> {
    let bin = powershell_quote(&bin_dir.display().to_string());
    let script = format!(
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); \
         $OutputEncoding = [Console]::OutputEncoding; \
         $bin = {bin}; \
         $path = [Environment]::GetEnvironmentVariable('Path', 'User'); \
         $parts = @(); \
         if (![string]::IsNullOrWhiteSpace($path)) {{ \
         \x20 $parts = $path -split ';' | Where-Object {{ ![string]::IsNullOrWhiteSpace($_) }} \
         }} \
         $normalizedBin = $bin.TrimEnd('\\', '/'); \
         $exists = $parts | Where-Object {{ $_.TrimEnd('\\', '/') -ieq $normalizedBin }}; \
         if (!$exists) {{ \
         \x20 $parts = @($bin) + $parts; \
         \x20 [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User') \
         }} \
         $verify = [Environment]::GetEnvironmentVariable('Path', 'User'); \
         $verified = ($verify -split ';' | Where-Object {{ $_.TrimEnd('\\', '/') -ieq $normalizedBin }}); \
         if (!$verified) {{ throw 'Envora bin directory was not persisted to the user Path.' }}"
    );

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()?;

    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Other(format!(
            "Failed to update the current user PATH: {}",
            if message.is_empty() {
                "PowerShell exited without an error message".to_string()
            } else {
                message
            }
        )));
    }

    Ok(())
}

#[cfg(windows)]
fn windows_user_path_contains(bin_dir: &Path) -> Result<bool, AppError> {
    let bin = powershell_quote(&bin_dir.display().to_string());
    let script = format!(
        "$bin = {bin}; \
         $path = [Environment]::GetEnvironmentVariable('Path', 'User'); \
         $normalizedBin = $bin.TrimEnd('\\', '/'); \
         if (($path -split ';' | Where-Object {{ $_.TrimEnd('\\', '/') -ieq $normalizedBin }})) {{ exit 0 }} else {{ exit 1 }}"
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()?;

    Ok(output.status.success())
}
