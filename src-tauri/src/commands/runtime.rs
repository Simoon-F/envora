use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::core::AppError;
use crate::runtime::factory;
use crate::runtime::provider::{RuntimeType, RuntimeVersion, VersionInfo};
use crate::settings::manager::AppSettings;
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

#[derive(Debug, Clone, Serialize)]
pub struct GoEnvStatus {
    pub go_version: Option<String>,
    pub default_go_version: Option<String>,
    pub go_executable: Option<PathBuf>,
    pub bin_dir: PathBuf,
    pub goenv: Option<String>,
    pub envora_goenv: PathBuf,
    pub goroot: Option<String>,
    pub gopath: Option<String>,
    pub envora_gopath: PathBuf,
    pub gomodcache: Option<String>,
    pub envora_gomodcache: PathBuf,
    pub gocache: Option<String>,
    pub envora_gocache: PathBuf,
    pub gobin: Option<String>,
    pub goproxy: Option<String>,
    pub gosumdb: Option<String>,
    pub gonosumdb: Option<String>,
    pub goprivate: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoEnvUpdate {
    pub gopath: Option<String>,
    pub gomodcache: Option<String>,
    pub gocache: Option<String>,
    pub gobin: Option<String>,
    pub goproxy: Option<String>,
    pub gosumdb: Option<String>,
    pub gonosumdb: Option<String>,
    pub goprivate: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GoToolStatus {
    pub name: String,
    pub label: String,
    pub description: String,
    pub package: String,
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GoToolsStatus {
    pub default_go_version: Option<String>,
    pub tools_bin_dir: PathBuf,
    pub tools: Vec<GoToolStatus>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GoCacheStatus {
    pub gomodcache: Option<PathBuf>,
    pub gomodcache_size: u64,
    pub gocache: Option<PathBuf>,
    pub gocache_size: u64,
    pub gotmpdir: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GoSdkRepairStatus {
    pub default_go_version: String,
    pub go_executable: PathBuf,
    pub bin_dir: PathBuf,
    pub tools_bin_dir: PathBuf,
}

struct GoToolDefinition {
    name: &'static str,
    label: &'static str,
    description: &'static str,
    package: &'static str,
    version_args: &'static [&'static str],
}

struct GoCommandContext {
    settings: AppSettings,
    default_go_version: String,
    go_path: PathBuf,
    env_path: String,
    goenv: String,
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
    let provider = factory::create_provider(runtime_type.clone(), settings.get());
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
    let provider = factory::create_provider(runtime_type.clone(), settings.get());
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
    let provider = factory::create_provider(runtime_type.clone(), settings.get());

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
    if runtime_type == RuntimeType::Go {
        apply_go_managed_paths_for_settings(settings.get())?;
    }
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
                if runtime == "go" {
                    let _ = apply_go_managed_paths_for_settings(&settings);
                }
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
    let provider = factory::create_provider(runtime_type.clone(), settings.get());
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
    let provider = factory::create_provider(runtime_type.clone(), settings.get());
    provider.switch_default(&version)?;
    if runtime_type == RuntimeType::Go {
        apply_go_managed_paths_for_settings(settings.get())?;
    }
    Ok(())
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
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    let provider = factory::create_provider(RuntimeType::Node, &settings);
    let default_node_version = provider.get_default()?;
    let bin_dir = settings.bin_dir.clone();
    let node_bin_dir = default_node_version
        .as_ref()
        .map(|version| node_install_bin_dir(&settings.runtime_dir, version));
    let env_path = build_node_path(&bin_dir, node_bin_dir.as_deref());
    let status_cwd = node_tool_status_dir(&settings.data_dir)?;

    let tools = ["node", "npm", "npx", "corepack", "yarn", "pnpm"]
        .into_iter()
        .map(|tool| {
            let path = find_tool_path(&bin_dir, node_bin_dir.as_deref(), tool);
            let version = path
                .as_ref()
                .and_then(|path| command_version(path, &env_path, Some(&status_cwd)).ok());

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

#[tauri::command]
pub async fn get_go_env_status(state: State<'_, AppState>) -> Result<GoEnvStatus, AppError> {
    let context = go_command_context(&state).await?;
    apply_go_managed_paths_for_context(&context)?;
    let paths = envora_go_paths(&context.settings);
    let values = read_go_env_values(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        &[
            "GOVERSION",
            "GOENV",
            "GOROOT",
            "GOPATH",
            "GOMODCACHE",
            "GOCACHE",
            "GOBIN",
            "GOPROXY",
            "GOSUMDB",
            "GONOSUMDB",
            "GOPRIVATE",
        ],
    )?;

    Ok(GoEnvStatus {
        go_version: env_value(&values, 0),
        default_go_version: Some(context.default_go_version),
        go_executable: Some(context.go_path),
        bin_dir: context.settings.bin_dir,
        goenv: env_value(&values, 1),
        envora_goenv: paths.goenv,
        goroot: env_value(&values, 2),
        gopath: env_value(&values, 3),
        envora_gopath: paths.gopath,
        gomodcache: env_value(&values, 4),
        envora_gomodcache: paths.gomodcache,
        gocache: env_value(&values, 5),
        envora_gocache: paths.gocache,
        gobin: env_value(&values, 6),
        goproxy: env_value(&values, 7),
        gosumdb: env_value(&values, 8),
        gonosumdb: env_value(&values, 9),
        goprivate: env_value(&values, 10),
    })
}

#[tauri::command]
pub async fn update_go_env(
    state: State<'_, AppState>,
    update: GoEnvUpdate,
) -> Result<GoEnvStatus, AppError> {
    let context = go_command_context(&state).await?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOPATH",
        update.gopath.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOMODCACHE",
        update.gomodcache.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOCACHE",
        update.gocache.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOBIN",
        update.gobin.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOPROXY",
        update.goproxy.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOSUMDB",
        update.gosumdb.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GONOSUMDB",
        update.gonosumdb.as_deref(),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOPRIVATE",
        update.goprivate.as_deref(),
    )?;

    get_go_env_status(state).await
}

#[tauri::command]
pub async fn apply_go_managed_paths(state: State<'_, AppState>) -> Result<GoEnvStatus, AppError> {
    let context = go_command_context(&state).await?;
    apply_go_managed_paths_for_context(&context)?;
    crate::commands::settings::ensure_shell_environment(&state).await?;
    get_go_env_status(state).await
}

fn apply_go_managed_paths_for_settings(settings: &AppSettings) -> Result<(), AppError> {
    let context = go_command_context_from_settings(settings)?;
    apply_go_managed_paths_for_context(&context)
}

fn apply_go_managed_paths_for_context(context: &GoCommandContext) -> Result<(), AppError> {
    let paths = envora_go_paths(&context.settings);
    std::fs::create_dir_all(&paths.gopath)?;
    std::fs::create_dir_all(&paths.gomodcache)?;
    std::fs::create_dir_all(&paths.gocache)?;
    let gopath = paths.gopath.to_string_lossy().to_string();
    let gomodcache = paths.gomodcache.to_string_lossy().to_string();
    let gocache = paths.gocache.to_string_lossy().to_string();

    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOPATH",
        Some(gopath.as_str()),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOMODCACHE",
        Some(gomodcache.as_str()),
    )?;
    set_go_env_value(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        "GOCACHE",
        Some(gocache.as_str()),
    )?;

    Ok(())
}

#[tauri::command]
pub async fn get_go_tools_status(state: State<'_, AppState>) -> Result<GoToolsStatus, AppError> {
    let context = go_command_context(&state).await?;
    let tools_bin_dir = go_tools_bin_dir(&context.settings.data_dir);
    std::fs::create_dir_all(&tools_bin_dir)?;
    let env_path = prepend_path(&tools_bin_dir, &context.env_path);

    let tools = go_tool_definitions()
        .iter()
        .map(|definition| {
            let path = tools_bin_dir.join(go_tool_file_name(definition.name));
            let installed = path.exists();
            let version = installed
                .then(|| command_output_text(&path, definition.version_args, &env_path, None).ok())
                .flatten()
                .and_then(|text| text.lines().next().map(|line| line.trim().to_string()))
                .filter(|line| !line.is_empty());

            GoToolStatus {
                name: definition.name.to_string(),
                label: definition.label.to_string(),
                description: definition.description.to_string(),
                package: definition.package.to_string(),
                installed,
                version,
                path: installed.then_some(path),
            }
        })
        .collect();

    Ok(GoToolsStatus {
        default_go_version: Some(context.default_go_version),
        tools_bin_dir,
        tools,
    })
}

#[tauri::command]
pub async fn install_go_tool(
    state: State<'_, AppState>,
    name: String,
    version: Option<String>,
) -> Result<GoToolsStatus, AppError> {
    let context = go_command_context(&state).await?;
    let definition = go_tool_definitions()
        .iter()
        .find(|definition| definition.name == name)
        .ok_or_else(|| AppError::Other(format!("Unknown Go tool: {}", name)))?;
    let tools_bin_dir = go_tools_bin_dir(&context.settings.data_dir);
    std::fs::create_dir_all(&tools_bin_dir)?;

    let version = version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("latest");
    let spec = format!("{}@{}", definition.package, version);
    let tools_bin_string = tools_bin_dir.to_string_lossy().to_string();
    let output = run_command_with_timeout_and_env(
        &context.go_path,
        &["install", &spec],
        &context.env_path,
        None,
        Duration::from_secs(600),
        &[
            ("GOENV", context.goenv.as_str()),
            ("GOBIN", tools_bin_string.as_str()),
        ],
    )?;

    if !output.status.success() {
        return Err(command_error(
            &format!("go install {}", spec),
            output.status.code(),
            &output.stderr,
        ));
    }

    crate::commands::settings::ensure_shell_environment(&state).await?;
    get_go_tools_status(state).await
}

#[tauri::command]
pub async fn get_go_cache_status(state: State<'_, AppState>) -> Result<GoCacheStatus, AppError> {
    let context = go_command_context(&state).await?;
    let values = read_go_env_values(
        &context.go_path,
        &context.env_path,
        &context.goenv,
        &["GOMODCACHE", "GOCACHE", "GOTMPDIR"],
    )?;
    let gomodcache = env_value(&values, 0).map(PathBuf::from);
    let gocache = env_value(&values, 1).map(PathBuf::from);
    let gotmpdir = env_value(&values, 2).map(PathBuf::from);

    Ok(GoCacheStatus {
        gomodcache_size: gomodcache.as_ref().map(dir_size).unwrap_or(0),
        gocache_size: gocache.as_ref().map(dir_size).unwrap_or(0),
        gomodcache,
        gocache,
        gotmpdir,
    })
}

#[tauri::command]
pub async fn clear_go_cache(
    state: State<'_, AppState>,
    target: String,
) -> Result<GoCacheStatus, AppError> {
    let context = go_command_context(&state).await?;
    let args: Vec<&str> = match target.as_str() {
        "build" => vec!["clean", "-cache"],
        "test" => vec!["clean", "-testcache"],
        "mod" => vec!["clean", "-modcache"],
        "all" => vec!["clean", "-cache", "-testcache", "-modcache"],
        _ => {
            return Err(AppError::Other(format!(
                "Unknown Go cache target: {}",
                target
            )))
        }
    };

    let output = run_command_with_timeout_and_env(
        &context.go_path,
        &args,
        &context.env_path,
        None,
        Duration::from_secs(300),
        &[("GOENV", context.goenv.as_str())],
    )?;
    if !output.status.success() {
        return Err(command_error(
            &format!("go {}", args.join(" ")),
            output.status.code(),
            &output.stderr,
        ));
    }

    get_go_cache_status(state).await
}

#[tauri::command]
pub async fn repair_go_sdk(state: State<'_, AppState>) -> Result<GoSdkRepairStatus, AppError> {
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    let provider = factory::create_provider(RuntimeType::Go, &settings);
    let default_go_version = provider
        .get_default()?
        .ok_or_else(|| AppError::DependencyMissing("请先安装并设置默认 Go 版本".to_string()))?;
    provider.switch_default(&default_go_version)?;
    crate::commands::settings::ensure_shell_environment(&state).await?;

    let go_bin_dir = go_install_bin_dir(&settings.runtime_dir, &default_go_version);
    let go_executable = find_go_tool_path(&settings.bin_dir, Some(&go_bin_dir), "go")
        .ok_or_else(|| AppError::DependencyMissing("go command not found".to_string()))?;

    Ok(GoSdkRepairStatus {
        default_go_version,
        go_executable,
        bin_dir: settings.bin_dir,
        tools_bin_dir: go_tools_bin_dir(&settings.data_dir),
    })
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

async fn go_command_context(state: &State<'_, AppState>) -> Result<GoCommandContext, AppError> {
    let settings = {
        let settings = state.settings.lock().await;
        settings.get().clone()
    };
    go_command_context_from_settings(&settings)
}

fn go_command_context_from_settings(settings: &AppSettings) -> Result<GoCommandContext, AppError> {
    let goenv = ensure_envora_goenv(&settings)?;
    let provider = factory::create_provider(RuntimeType::Go, &settings);
    let default_go_version = provider
        .get_default()?
        .ok_or_else(|| AppError::DependencyMissing("请先安装并设置默认 Go 版本".to_string()))?;
    let go_bin_dir = go_install_bin_dir(&settings.runtime_dir, &default_go_version);
    let go_path = find_go_tool_path(&settings.bin_dir, Some(&go_bin_dir), "go")
        .ok_or_else(|| AppError::DependencyMissing("go command not found".to_string()))?;
    let env_path = build_runtime_path(&settings.bin_dir, Some(&go_bin_dir));

    Ok(GoCommandContext {
        settings: settings.clone(),
        default_go_version,
        go_path,
        env_path,
        goenv: goenv.to_string_lossy().to_string(),
    })
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

fn go_install_bin_dir(runtime_dir: &Path, version: &str) -> PathBuf {
    runtime_dir.join("go").join(version).join("bin")
}

fn go_tools_bin_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("go-tools").join("bin")
}

struct EnvoraGoPaths {
    goenv: PathBuf,
    gopath: PathBuf,
    gomodcache: PathBuf,
    gocache: PathBuf,
}

fn envora_go_paths(settings: &AppSettings) -> EnvoraGoPaths {
    let go_dir = settings.data_dir.join("go");
    EnvoraGoPaths {
        goenv: go_dir.join("env"),
        gopath: go_dir.join("path"),
        gomodcache: go_dir.join("pkg").join("mod"),
        gocache: go_dir.join("cache").join("build"),
    }
}

fn ensure_envora_goenv(settings: &AppSettings) -> Result<PathBuf, AppError> {
    let paths = envora_go_paths(settings);
    if let Some(parent) = paths.goenv.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if !paths.goenv.exists() {
        std::fs::write(&paths.goenv, "")?;
    }
    Ok(paths.goenv)
}

fn node_tool_status_dir(data_dir: &Path) -> Result<PathBuf, AppError> {
    let path = data_dir.join(".corepack-status");
    std::fs::create_dir_all(&path)?;
    Ok(path)
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

fn go_tool_file_name(tool: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        format!("{}.exe", tool)
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

fn find_go_tool_path(bin_dir: &Path, go_bin_dir: Option<&Path>, tool: &str) -> Option<PathBuf> {
    let file_name = go_tool_file_name(tool);
    let envora_path = bin_dir.join(&file_name);
    if envora_path.exists() {
        return Some(envora_path);
    }

    let go_path = go_bin_dir.map(|dir| dir.join(file_name));
    go_path.filter(|path| path.exists())
}

fn build_node_path(bin_dir: &Path, node_bin_dir: Option<&Path>) -> String {
    build_runtime_path(bin_dir, node_bin_dir)
}

fn build_runtime_path(bin_dir: &Path, runtime_bin_dir: Option<&Path>) -> String {
    let mut paths = Vec::new();
    paths.push(bin_dir.to_path_buf());
    if let Some(runtime_bin_dir) = runtime_bin_dir {
        paths.push(runtime_bin_dir.to_path_buf());
    }
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }

    std::env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn prepend_path(path: &Path, existing: &str) -> String {
    let mut paths = vec![path.to_path_buf()];
    paths.extend(std::env::split_paths(existing));

    std::env::join_paths(paths)
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

fn go_tool_definitions() -> &'static [GoToolDefinition] {
    &[
        GoToolDefinition {
            name: "gopls",
            label: "gopls",
            description: "Go language server",
            package: "golang.org/x/tools/gopls",
            version_args: &["version"],
        },
        GoToolDefinition {
            name: "dlv",
            label: "Delve",
            description: "Go debugger",
            package: "github.com/go-delve/delve/cmd/dlv",
            version_args: &["version"],
        },
        GoToolDefinition {
            name: "staticcheck",
            label: "Staticcheck",
            description: "Static analysis linter",
            package: "honnef.co/go/tools/cmd/staticcheck",
            version_args: &["-version"],
        },
        GoToolDefinition {
            name: "golangci-lint",
            label: "golangci-lint",
            description: "Multi-linter runner",
            package: "github.com/golangci/golangci-lint/v2/cmd/golangci-lint",
            version_args: &["--version"],
        },
        GoToolDefinition {
            name: "air",
            label: "Air",
            description: "Live reload runner",
            package: "github.com/air-verse/air",
            version_args: &["-v"],
        },
    ]
}

fn read_go_env_values(
    command: &Path,
    env_path: &str,
    goenv: &str,
    keys: &[&str],
) -> Result<Vec<String>, AppError> {
    let mut args = Vec::with_capacity(keys.len() + 1);
    args.push("env");
    args.extend_from_slice(keys);

    let output = run_command_with_timeout_and_env(
        command,
        &args,
        env_path,
        None,
        Duration::from_secs(12),
        &[("GOENV", goenv)],
    )?;
    if !output.status.success() {
        return Err(command_error(
            &format!("{} env", command.display()),
            output.status.code(),
            &output.stderr,
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .collect())
}

fn env_value(values: &[String], index: usize) -> Option<String> {
    values
        .get(index)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn set_go_env_value(
    command: &Path,
    env_path: &str,
    goenv: &str,
    key: &'static str,
    value: Option<&str>,
) -> Result<(), AppError> {
    let value = value.map(str::trim).unwrap_or_default();
    let output = if value.is_empty() {
        run_command_with_timeout_and_env(
            command,
            &["env", "-u", key],
            env_path,
            None,
            Duration::from_secs(12),
            &[("GOENV", goenv)],
        )?
    } else {
        let assignment = format!("{}={}", key, value);
        run_command_with_timeout_and_env(
            command,
            &["env", "-w", &assignment],
            env_path,
            None,
            Duration::from_secs(12),
            &[("GOENV", goenv)],
        )?
    };

    if !output.status.success() {
        return Err(command_error(
            &format!("go env {}", key),
            output.status.code(),
            &output.stderr,
        ));
    }

    Ok(())
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

fn command_output_text(
    command: &Path,
    args: &[&str],
    env_path: &str,
    cwd: Option<&Path>,
) -> Result<String, AppError> {
    let output = run_command_with_timeout(command, args, env_path, cwd, Duration::from_secs(12))?;
    if !output.status.success() {
        return Err(command_error(
            &format!("{} {}", command.display(), args.join(" ")),
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
    run_command_with_timeout_and_env(command, args, env_path, cwd, timeout, &[])
}

fn run_command_with_timeout_and_env(
    command: &Path,
    args: &[&str],
    env_path: &str,
    cwd: Option<&Path>,
    timeout: Duration,
    extra_env: &[(&str, &str)],
) -> Result<CommandOutput, AppError> {
    let mut cmd = Command::new(command);
    cmd.args(args).env("PATH", env_path);
    for (key, value) in extra_env {
        cmd.env(key, value);
    }
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
