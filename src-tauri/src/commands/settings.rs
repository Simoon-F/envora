use tauri::State;

use crate::core::AppError;
use crate::settings::manager::AppSettings;
use crate::state::AppState;

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
