use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperationStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationTarget {
    pub runtime: Option<String>,
    pub tool: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationInfo {
    pub id: String,
    pub kind: String,
    pub target: OperationTarget,
    pub status: OperationStatus,
    pub stage: String,
    pub message: String,
    pub percent: f64,
    pub error: Option<String>,
    pub started_at: String,
    pub updated_at: String,
}

#[derive(Default)]
pub struct OperationManager {
    operations: HashMap<String, OperationInfo>,
}

impl OperationManager {
    pub fn list(&self) -> Vec<OperationInfo> {
        let mut operations: Vec<_> = self.operations.values().cloned().collect();
        operations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        operations
    }

    pub fn insert(&mut self, operation: OperationInfo) {
        self.operations.insert(operation.id.clone(), operation);
    }

    pub fn update_progress(
        &mut self,
        id: &str,
        percent: f64,
        stage: impl Into<String>,
        message: impl Into<String>,
    ) -> Option<OperationInfo> {
        let operation = self.operations.get_mut(id)?;
        if matches!(
            operation.status,
            OperationStatus::Completed | OperationStatus::Failed | OperationStatus::Cancelled
        ) {
            return Some(operation.clone());
        }
        operation.status = OperationStatus::Running;
        operation.percent = percent;
        operation.stage = stage.into();
        operation.message = message.into();
        operation.updated_at = chrono::Local::now().to_rfc3339();
        Some(operation.clone())
    }

    pub fn complete(&mut self, id: &str, message: impl Into<String>) -> Option<OperationInfo> {
        let operation = self.operations.get_mut(id)?;
        operation.status = OperationStatus::Completed;
        operation.percent = 100.0;
        operation.stage = "completed".to_string();
        operation.message = message.into();
        operation.error = None;
        operation.updated_at = chrono::Local::now().to_rfc3339();
        Some(operation.clone())
    }

    pub fn fail(&mut self, id: &str, error: impl Into<String>) -> Option<OperationInfo> {
        let operation = self.operations.get_mut(id)?;
        let error = error.into();
        operation.status = OperationStatus::Failed;
        operation.stage = "failed".to_string();
        operation.message = "任务失败".to_string();
        operation.error = Some(error);
        operation.updated_at = chrono::Local::now().to_rfc3339();
        Some(operation.clone())
    }

    pub fn remove(&mut self, id: &str) {
        self.operations.remove(id);
    }
}
