use tauri::{Emitter, State};

use crate::core::AppError;
use crate::runtime::factory;
use crate::runtime::provider::{RuntimeType, RuntimeVersion, VersionInfo};
use crate::state::{AppState, OperationInfo, OperationStatus, OperationTarget};

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
