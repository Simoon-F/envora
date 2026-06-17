use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::core::AppError;
use crate::runtime::factory;
use crate::runtime::provider::{RuntimeType, RuntimeVersion, VersionInfo};
use crate::state::{AppState, OperationInfo, OperationStatus, OperationTarget};

#[derive(Debug, Clone, Serialize)]
pub struct NodeToolStatus {
    pub name: String,
    pub version: Option<String>,
    pub path: Option<PathBuf>,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectPackageManager {
    pub name: String,
    pub version: Option<String>,
    pub raw: String,
    pub package_json_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct NodePackageManagerStatus {
    pub node_version: Option<String>,
    pub default_node_version: Option<String>,
    pub bin_dir: PathBuf,
    pub corepack_enabled: bool,
    pub tools: Vec<NodeToolStatus>,
    pub project_dir: Option<PathBuf>,
    pub project_package_manager: Option<ProjectPackageManager>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodePackageManagerName {
    Pnpm,
    Yarn,
}

impl NodePackageManagerName {
    fn as_str(&self) -> &'static str {
        match self {
            NodePackageManagerName::Pnpm => "pnpm",
            NodePackageManagerName::Yarn => "yarn",
        }
    }
}

fn emit_operation(app: &tauri::AppHandle, operation: &OperationInfo) {
    let _ = app.emit("envora://operation", operation);
}

#[tauri::command]
pub async fn list_installed_versions(
    state: State<'_, AppState>,
    runtime: String,
) -> Result<Vec<RuntimeVersion>, AppError> {
    let settings = state.settings.lock().await;
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let provider = factory::create_provider(runtime_type, settings.get());
    provider.list_installed()
}

#[tauri::command]
pub async fn list_available_versions(
    state: State<'_, AppState>,
    runtime: String,
) -> Result<Vec<VersionInfo>, AppError> {
    let settings = state.settings.lock().await;
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let provider = factory::create_provider(runtime_type, settings.get());
    provider.available_versions().await
}

#[tauri::command]
pub async fn install_version(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    runtime: String,
    version: String,
) -> Result<RuntimeVersion, AppError> {
    let settings = state.settings.lock().await;
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let provider = factory::create_provider(runtime_type, settings.get());

    let app_handle = app.clone();
    let runtime_clone = runtime.clone();
    let version_clone = version.clone();

    let on_progress = Box::new(move |percent: f64, message: String| {
        let _ = app_handle.emit(
            "envora://progress",
            crate::core::EventPayload::BuildProgress {
                runtime: runtime_clone.clone(),
                version: version_clone.clone(),
                stage: crate::core::BuildStage::Compiling,
                message,
                percent,
            },
        );
    });

    let installed = provider
        .install(version.as_str(), Some(on_progress))
        .await?;
    crate::commands::settings::ensure_shell_environment(&state).await?;

    Ok(installed)
}

#[tauri::command]
pub async fn start_runtime_install(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    runtime: String,
    version: String,
) -> Result<OperationInfo, AppError> {
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let state = state.inner().clone();
    let operation = OperationInfo {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "runtime_install".to_string(),
        target: OperationTarget {
            runtime: Some(runtime.clone()),
            tool: None,
            version: Some(version.clone()),
        },
        status: OperationStatus::Running,
        stage: "queued".to_string(),
        message: format!("准备安装 {} {}...", runtime, version),
        percent: 0.0,
        error: None,
        started_at: chrono::Local::now().to_rfc3339(),
        updated_at: chrono::Local::now().to_rfc3339(),
    };

    {
        let mut operations = state.operations.lock().await;
        operations.insert(operation.clone());
    }
    emit_operation(&app, &operation);

    let operation_id = operation.id.clone();
    tauri::async_runtime::spawn(async move {
        let provider = factory::create_provider(runtime_type, &settings);
        let app_handle = app.clone();
        let progress_state = state.clone();
        let progress_operation_id = operation_id.clone();

        let on_progress = Box::new(move |percent: f64, message: String| {
            let app_handle = app_handle.clone();
            let state = progress_state.clone();
            let operation_id = progress_operation_id.clone();
            tauri::async_runtime::spawn(async move {
                let operation = {
                    let mut operations = state.operations.lock().await;
                    operations.update_progress(&operation_id, percent, "running", message)
                };
                if let Some(operation) = operation {
                    emit_operation(&app_handle, &operation);
                }
            });
        });

        match provider.install(version.as_str(), Some(on_progress)).await {
            Ok(installed) => {
                let _ = crate::commands::settings::ensure_shell_environment(&state).await;
                let operation = {
                    let mut operations = state.operations.lock().await;
                    operations.complete(&operation_id, "安装完成")
                };
                if let Some(operation) = operation {
                    emit_operation(&app, &operation);
                }
                let _ = app.emit(
                    "envora://runtime-install-finished",
                    serde_json::json!({
                        "runtime": runtime,
                        "version": version,
                        "install_dir": installed.install_dir,
                        "operation_id": operation_id,
                    }),
                );
            }
            Err(error) => {
                let operation = {
                    let mut operations = state.operations.lock().await;
                    operations.fail(&operation_id, error.to_string())
                };
                if let Some(operation) = operation {
                    emit_operation(&app, &operation);
                }
                let _ = app.emit(
                    "envora://runtime-install-error",
                    serde_json::json!({
                        "runtime": runtime,
                        "version": version,
                        "message": error.to_string(),
                        "operation_id": operation_id,
                    }),
                );
            }
        }
    });

    Ok(operation)
}

#[tauri::command]
pub async fn list_operations(state: State<'_, AppState>) -> Result<Vec<OperationInfo>, AppError> {
    let operations = state.operations.lock().await;
    Ok(operations.list())
}

#[tauri::command]
pub async fn clear_operation(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let mut operations = state.operations.lock().await;
    operations.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn uninstall_version(
    state: State<'_, AppState>,
    runtime: String,
    version: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let provider = factory::create_provider(runtime_type, settings.get());
    provider.uninstall(&version).await
}

#[tauri::command]
pub async fn switch_default_version(
    state: State<'_, AppState>,
    runtime: String,
    version: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let provider = factory::create_provider(runtime_type, settings.get());
    provider.switch_default(&version)
}

#[tauri::command]
pub async fn get_default_version(
    state: State<'_, AppState>,
    runtime: String,
) -> Result<Option<String>, AppError> {
    let settings = state.settings.lock().await;
    let runtime_type = RuntimeType::from_str(&runtime)
        .ok_or_else(|| AppError::Other(format!("Unknown runtime: {}", runtime)))?;
    let provider = factory::create_provider(runtime_type, settings.get());
    provider.get_default()
}

#[tauri::command]
pub async fn get_node_package_manager_status(
    state: State<'_, AppState>,
    project_dir: Option<String>,
) -> Result<NodePackageManagerStatus, AppError> {
    let settings = state.settings.lock().await;
    let provider = factory::create_provider(RuntimeType::Node, settings.get());
    let default_node_version = provider.get_default()?;
    let bin_dir = settings.get().bin_dir.clone();
    let node_bin_dir = default_node_version
        .as_ref()
        .map(|version| node_install_bin_dir(&settings.get().runtime_dir, version));
    let env_path = build_node_path(&bin_dir, node_bin_dir.as_deref());

    let tools = ["node", "npm", "npx", "corepack", "yarn", "pnpm"]
        .into_iter()
        .map(|tool| {
            let path = find_tool_path(&bin_dir, node_bin_dir.as_deref(), tool);
            let version = path
                .as_ref()
                .and_then(|path| command_version(path, &env_path, None).ok());

            NodeToolStatus {
                name: tool.to_string(),
                available: version.is_some() || path.as_ref().is_some_and(|p| p.exists()),
                version,
                path,
            }
        })
        .collect::<Vec<_>>();

    let node_version = tools
        .iter()
        .find(|tool| tool.name == "node")
        .and_then(|tool| tool.version.clone())
        .map(|version| version.trim_start_matches('v').to_string());
    let corepack_enabled = tools
        .iter()
        .any(|tool| matches!(tool.name.as_str(), "yarn" | "pnpm") && tool.path.is_some());
    let resolved_project_dir = resolve_project_dir(project_dir);
    let project_package_manager = resolved_project_dir
        .as_ref()
        .and_then(|dir| read_project_package_manager(dir).ok().flatten());

    Ok(NodePackageManagerStatus {
        node_version,
        default_node_version,
        bin_dir,
        corepack_enabled,
        tools,
        project_dir: resolved_project_dir,
        project_package_manager,
    })
}

#[tauri::command]
pub async fn set_corepack_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<NodePackageManagerStatus, AppError> {
    let (bin_dir, corepack_path, env_path) = node_command_context(&state).await?;
    std::fs::create_dir_all(&bin_dir)?;

    let action = if enabled { "enable" } else { "disable" };
    let output = run_command_with_timeout(
        &corepack_path,
        &[action, "--install-directory", &bin_dir.to_string_lossy()],
        &env_path,
        None,
        Duration::from_secs(60),
    )?;

    if !output.status.success() {
        return Err(command_error(
            &format!("corepack {}", action),
            output.status.code(),
            &output.stderr,
        ));
    }

    get_node_package_manager_status(state, None).await
}

#[tauri::command]
pub async fn install_node_package_manager(
    state: State<'_, AppState>,
    manager: NodePackageManagerName,
    version: Option<String>,
) -> Result<NodePackageManagerStatus, AppError> {
    let (bin_dir, corepack_path, env_path) = node_command_context(&state).await?;
    std::fs::create_dir_all(&bin_dir)?;
    let enable_output = run_command_with_timeout(
        &corepack_path,
        &["enable", "--install-directory", &bin_dir.to_string_lossy()],
        &env_path,
        None,
        Duration::from_secs(60),
    )?;
    if !enable_output.status.success() {
        return Err(command_error(
            "corepack enable",
            enable_output.status.code(),
            &enable_output.stderr,
        ));
    }

    let version = version
        .filter(|version| !version.trim().is_empty())
        .unwrap_or_else(|| match manager {
            NodePackageManagerName::Pnpm => "latest".to_string(),
            NodePackageManagerName::Yarn => "stable".to_string(),
        });
    let spec = format!("{}@{}", manager.as_str(), version.trim());
    let output = run_command_with_timeout(
        &corepack_path,
        &["install", "-g", &spec],
        &env_path,
        None,
        Duration::from_secs(180),
    )?;

    if !output.status.success() {
        return Err(command_error(
            &format!("corepack install -g {}", spec),
            output.status.code(),
            &output.stderr,
        ));
    }

    get_node_package_manager_status(state, None).await
}

#[tauri::command]
pub async fn install_project_package_manager(
    state: State<'_, AppState>,
    project_dir: String,
) -> Result<NodePackageManagerStatus, AppError> {
    let project_dir = PathBuf::from(project_dir);
    let (bin_dir, corepack_path, env_path) = node_command_context(&state).await?;
    std::fs::create_dir_all(&bin_dir)?;
    let enable_output = run_command_with_timeout(
        &corepack_path,
        &["enable", "--install-directory", &bin_dir.to_string_lossy()],
        &env_path,
        None,
        Duration::from_secs(60),
    )?;
    if !enable_output.status.success() {
        return Err(command_error(
            "corepack enable",
            enable_output.status.code(),
            &enable_output.stderr,
        ));
    }

    if read_project_package_manager(&project_dir)?.is_none() {
        return Err(AppError::Config(format!(
            "{} does not declare packageManager",
            project_dir.join("package.json").display()
        )));
    }

    let output = run_command_with_timeout(
        &corepack_path,
        &["install"],
        &env_path,
        Some(&project_dir),
        Duration::from_secs(180),
    )?;

    if !output.status.success() {
        return Err(command_error(
            "corepack install",
            output.status.code(),
            &output.stderr,
        ));
    }

    get_node_package_manager_status(state, Some(project_dir.to_string_lossy().to_string())).await
}

async fn node_command_context(
    state: &State<'_, AppState>,
) -> Result<(PathBuf, PathBuf, String), AppError> {
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    let provider = factory::create_provider(RuntimeType::Node, &settings);
    let default_node_version = provider.get_default()?.ok_or_else(|| {
        AppError::DependencyMissing("请先安装并设置默认 Node.js 版本".to_string())
    })?;
    let node_bin_dir = node_install_bin_dir(&settings.runtime_dir, &default_node_version);
    let corepack_path = find_tool_path(&settings.bin_dir, Some(&node_bin_dir), "corepack")
        .ok_or_else(|| AppError::DependencyMissing("corepack command not found".to_string()))?;
    let env_path = build_node_path(&settings.bin_dir, Some(&node_bin_dir));

    Ok((settings.bin_dir, corepack_path, env_path))
}

fn node_install_bin_dir(runtime_dir: &Path, version: &str) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        runtime_dir.join("node").join(version)
    }
    #[cfg(not(target_os = "windows"))]
    {
        runtime_dir.join("node").join(version).join("bin")
    }
}

fn tool_file_name(tool: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        match tool {
            "node" => "node.exe".to_string(),
            _ => format!("{}.cmd", tool),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        tool.to_string()
    }
}

fn find_tool_path(bin_dir: &Path, node_bin_dir: Option<&Path>, tool: &str) -> Option<PathBuf> {
    let file_name = tool_file_name(tool);
    let envora_path = bin_dir.join(&file_name);
    if envora_path.exists() {
        return Some(envora_path);
    }

    let node_path = node_bin_dir.map(|dir| dir.join(file_name));
    node_path.filter(|path| path.exists())
}

fn build_node_path(bin_dir: &Path, node_bin_dir: Option<&Path>) -> String {
    let mut paths = Vec::new();
    paths.push(bin_dir.to_path_buf());
    if let Some(node_bin_dir) = node_bin_dir {
        paths.push(node_bin_dir.to_path_buf());
    }
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }

    std::env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn command_version(command: &Path, env_path: &str, cwd: Option<&Path>) -> Result<String, AppError> {
    let output = run_command_with_timeout(
        command,
        &["--version"],
        env_path,
        cwd,
        Duration::from_secs(12),
    )?;
    if !output.status.success() {
        return Err(command_error(
            &format!("{} --version", command.display()),
            output.status.code(),
            &output.stderr,
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

struct CommandOutput {
    status: std::process::ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn run_command_with_timeout(
    command: &Path,
    args: &[&str],
    env_path: &str,
    cwd: Option<&Path>,
    timeout: Duration,
) -> Result<CommandOutput, AppError> {
    let mut cmd = Command::new(command);
    cmd.args(args).env("PATH", env_path);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    let started = Instant::now();

    loop {
        if child.try_wait()?.is_some() {
            let output = child.wait_with_output()?;
            return Ok(CommandOutput {
                status: output.status,
                stdout: output.stdout,
                stderr: output.stderr,
            });
        }

        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Other(format!(
                "Command timed out after {}s: {} {}",
                timeout.as_secs(),
                command.display(),
                args.join(" ")
            )));
        }

        std::thread::sleep(Duration::from_millis(50));
    }
}

fn command_error(command: &str, code: Option<i32>, stderr: &[u8]) -> AppError {
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    let suffix = if stderr.is_empty() {
        String::new()
    } else {
        format!(": {}", stderr)
    };

    AppError::Other(format!(
        "{} failed{}{}",
        command,
        code.map(|code| format!(" with exit code {}", code))
            .unwrap_or_default(),
        suffix
    ))
}

fn resolve_project_dir(project_dir: Option<String>) -> Option<PathBuf> {
    if let Some(project_dir) = project_dir {
        let project_dir = PathBuf::from(project_dir);
        if project_dir.join("package.json").exists() {
            return Some(project_dir);
        }
        return None;
    }

    std::env::current_dir()
        .ok()
        .filter(|dir| dir.join("package.json").exists())
}

fn read_project_package_manager(
    project_dir: &Path,
) -> Result<Option<ProjectPackageManager>, AppError> {
    let package_json_path = project_dir.join("package.json");
    if !package_json_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&package_json_path)?;
    let value: serde_json::Value = serde_json::from_str(&content)?;
    let Some(raw) = value
        .get("packageManager")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let (name, version) = raw
        .rsplit_once('@')
        .map(|(name, version)| (name.to_string(), Some(version.to_string())))
        .unwrap_or_else(|| (raw.to_string(), None));

    Ok(Some(ProjectPackageManager {
        name,
        version,
        raw: raw.to_string(),
        package_json_path,
    }))
}
