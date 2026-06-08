use tauri::{Emitter, State};

use crate::core::AppError;
use crate::runtime::factory;
use crate::runtime::provider::{RuntimeType, RuntimeVersion, VersionInfo};
use crate::state::AppState;

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
    crate::commands::settings::ensure_shell_environment(&state)?;

    Ok(installed)
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
