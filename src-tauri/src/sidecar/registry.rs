use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::manager::ProcessInfo;
use crate::core::AppError;

#[derive(Debug, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub uuid: String,
    pub config_id: String,
    pub pid: Option<u32>,
    pub status: String,
    pub started_at: Option<String>,
}

/// Process registry for persisting process state
pub struct ProcessRegistry {
    path: PathBuf,
    entries: HashMap<String, RegistryEntry>,
}

impl ProcessRegistry {
    pub fn new(config_dir: &PathBuf) -> Self {
        let path = config_dir.join("process_registry.json");
        let entries = Self::load_from_file(&path);

        Self { path, entries }
    }

    fn load_from_file(path: &PathBuf) -> HashMap<String, RegistryEntry> {
        if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(entries) => return entries,
                    Err(e) => {
                        tracing::warn!("Failed to parse process registry: {}", e);
                    }
                },
                Err(e) => {
                    tracing::warn!("Failed to read process registry: {}", e);
                }
            }
        }
        HashMap::new()
    }

    /// Register a process
    pub fn register(&mut self, info: &ProcessInfo) -> Result<(), AppError> {
        let entry = RegistryEntry {
            uuid: info.uuid.clone(),
            config_id: info.config.id.clone(),
            pid: info.pid,
            status: format!("{:?}", info.status),
            started_at: info.started_at.clone(),
        };

        self.entries.insert(info.uuid.clone(), entry);
        self.persist()
    }

    /// Unregister a process
    pub fn unregister(&mut self, uuid: &str) -> Result<(), AppError> {
        self.entries.remove(uuid);
        self.persist()
    }

    /// Get all registered entries
    pub fn get_all(&self) -> &HashMap<String, RegistryEntry> {
        &self.entries
    }

    /// Persist registry to disk
    fn persist(&self) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(&self.entries)?;
        std::fs::write(&self.path, content)?;
        Ok(())
    }

    /// Clean up dead processes from registry
    pub fn cleanup_dead(&mut self) {
        let dead_uuids: Vec<String> = self
            .entries
            .iter()
            .filter_map(|(uuid, entry)| {
                if let Some(pid) = entry.pid {
                    if !super::manager::is_process_alive(pid) {
                        return Some(uuid.clone());
                    }
                }
                None
            })
            .collect();

        for uuid in dead_uuids {
            self.entries.remove(&uuid);
        }

        let _ = self.persist();
    }
}
