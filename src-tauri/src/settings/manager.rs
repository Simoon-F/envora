use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::core::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Light,
    Dark,
    System,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub data_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub bin_dir: PathBuf,
    pub log_dir: PathBuf,
    pub default_versions: HashMap<String, String>,
    pub auto_start_services: bool,
    pub theme: Theme,
}

impl AppSettings {
    pub fn new(data_dir: &PathBuf) -> Self {
        Self {
            data_dir: data_dir.clone(),
            runtime_dir: data_dir.join("runtimes"),
            bin_dir: data_dir.join("bin"),
            log_dir: data_dir.join("logs"),
            default_versions: HashMap::new(),
            auto_start_services: false,
            theme: Theme::default(),
        }
    }
}

pub struct SettingsManager {
    config_path: PathBuf,
    settings: AppSettings,
}

impl SettingsManager {
    pub fn new(config_dir: &PathBuf) -> Self {
        let config_path = config_dir.join("settings.json");
        let settings = Self::load_from_file(&config_path, config_dir);

        Self {
            config_path,
            settings,
        }
    }

    fn load_from_file(path: &PathBuf, data_dir: &PathBuf) -> AppSettings {
        if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                    Ok(settings) => return settings,
                    Err(e) => {
                        tracing::warn!("Failed to parse settings: {}, using defaults", e);
                    }
                },
                Err(e) => {
                    tracing::warn!("Failed to read settings: {}, using defaults", e);
                }
            }
        }

        // Determine data_dir from config_dir parent
        let data_dir = data_dir.parent().unwrap_or(data_dir).to_path_buf();

        AppSettings::new(&data_dir)
    }

    pub fn get(&self) -> &AppSettings {
        &self.settings
    }

    pub fn update<F>(&mut self, updater: F) -> Result<(), AppError>
    where
        F: FnOnce(&mut AppSettings),
    {
        updater(&mut self.settings);
        self.save()
    }

    fn save(&self) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(&self.settings)?;
        std::fs::write(&self.config_path, content)?;
        Ok(())
    }
}
