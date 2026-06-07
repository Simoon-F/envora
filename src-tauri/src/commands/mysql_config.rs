use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MysqlUser {
    pub user: String,
    pub host: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MysqlDatabase {
    pub name: String,
}

// ── Helpers ────────────────────────────────────────────────────────

fn mysql_dir(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    settings.runtime_dir.join("mysql").join(version)
}

fn mysql_bin(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    mysql_dir(settings, version).join("bin").join("mysql")
}

/// Run a MySQL query and return stdout lines
fn mysql_query(settings: &crate::settings::manager::AppSettings, version: &str, sql: &str) -> Result<String, AppError> {
    let mysql = mysql_bin(settings, version);
    // Use TCP connection to avoid socket path issues
    let output = PlatformOps::shell_command(&format!(
        "\"{}\" -u root -h 127.0.0.1 --skip-column-names -e \"{}\"",
        mysql.display(),
        sql
    ))
    .output()?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        // Don't fail on warnings, only on real errors
        if err.contains("ERROR") {
            return Err(AppError::Other(format!("MySQL query failed: {}", err)));
        }
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ── my.cnf ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_mysql_config(
    state: State<'_, AppState>,
    version: String,
) -> Result<String, AppError> {
    let settings = state.settings.lock().await;
    let path = mysql_dir(settings.get(), &version).join("my.cnf");

    if !path.exists() {
        return Err(AppError::Config(format!(
            "my.cnf not found for MySQL {}", version
        )));
    }

    std::fs::read_to_string(&path).map_err(|e| AppError::Io(e))
}

#[tauri::command]
pub async fn save_mysql_config(
    state: State<'_, AppState>,
    version: String,
    content: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let path = mysql_dir(settings.get(), &version).join("my.cnf");

    let backup = path.with_extension("my.cnf.bak");
    if path.exists() {
        let _ = std::fs::copy(&path, &backup);
    }

    std::fs::write(&path, &content)?;
    Ok(())
}

// ── Users ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_mysql_users(
    state: State<'_, AppState>,
    version: String,
) -> Result<Vec<MysqlUser>, AppError> {
    let settings = state.settings.lock().await;
    let output = mysql_query(settings.get(), &version, "SELECT user, host FROM mysql.user ORDER BY user")?;

    let users: Vec<MysqlUser> = output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let parts: Vec<&str> = l.split('\t').collect();
            if parts.len() >= 2 {
                Some(MysqlUser {
                    user: parts[0].trim().to_string(),
                    host: parts[1].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(users)
}

#[tauri::command]
pub async fn create_mysql_user(
    state: State<'_, AppState>,
    version: String,
    username: String,
    password: String,
    host: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let sql = format!(
        "CREATE USER '{}'@'{}' IDENTIFIED BY '{}'",
        username.replace('\'', "\\'"),
        host.replace('\'', "\\'"),
        password.replace('\'', "\\'")
    );
    mysql_query(settings.get(), &version, &sql)?;

    // Grant basic privileges
    let grant = format!("GRANT ALL PRIVILEGES ON *.* TO '{}'@'{}' WITH GRANT OPTION",
        username.replace('\'', "\\'"),
        host.replace('\'', "\\'")
    );
    mysql_query(settings.get(), &version, &grant)?;
    mysql_query(settings.get(), &version, "FLUSH PRIVILEGES")?;

    Ok(())
}

#[tauri::command]
pub async fn drop_mysql_user(
    state: State<'_, AppState>,
    version: String,
    username: String,
    host: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let sql = format!(
        "DROP USER '{}'@'{}'",
        username.replace('\'', "\\'"),
        host.replace('\'', "\\'")
    );
    mysql_query(settings.get(), &version, &sql)?;
    Ok(())
}

#[tauri::command]
pub async fn change_mysql_password(
    state: State<'_, AppState>,
    version: String,
    username: String,
    host: String,
    password: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let sql = format!(
        "ALTER USER '{}'@'{}' IDENTIFIED BY '{}'",
        username.replace('\'', "\\'"),
        host.replace('\'', "\\'"),
        password.replace('\'', "\\'")
    );
    mysql_query(settings.get(), &version, &sql)?;
    Ok(())
}

// ── Databases ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_mysql_databases(
    state: State<'_, AppState>,
    version: String,
) -> Result<Vec<MysqlDatabase>, AppError> {
    let settings = state.settings.lock().await;
    let output = mysql_query(
        settings.get(),
        &version,
        "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
    )?;

    let dbs: Vec<MysqlDatabase> = output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| MysqlDatabase {
            name: l.trim().to_string(),
        })
        .collect();

    Ok(dbs)
}

#[tauri::command]
pub async fn create_mysql_database(
    state: State<'_, AppState>,
    version: String,
    database: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let sql = format!("CREATE DATABASE `{}`", database.replace('`', "\\`"));
    mysql_query(settings.get(), &version, &sql)?;
    Ok(())
}

#[tauri::command]
pub async fn drop_mysql_database(
    state: State<'_, AppState>,
    version: String,
    database: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let sql = format!("DROP DATABASE `{}`", database.replace('`', "\\`"));
    mysql_query(settings.get(), &version, &sql)?;
    Ok(())
}
