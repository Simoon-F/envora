use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::platform::PlatformOps;
use crate::core::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VirtualHost {
    pub id: String,
    pub domain: String,
    pub root_dir: String,
    pub php_version: String,
    pub port: u16,
    pub enabled: bool,
    pub hosts_managed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VHostConfig {
    pub domain: String,
    pub root_dir: String,
    pub php_version: String,
    pub port: u16,
}

// ── Helpers ────────────────────────────────────────────────────────

fn nginx_dir(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    settings.runtime_dir.join("nginx").join(version)
}

fn vhosts_dir(settings: &crate::settings::manager::AppSettings, version: &str) -> PathBuf {
    nginx_dir(settings, version).join("conf").join("vhosts")
}

fn vhosts_file(settings: &crate::settings::manager::AppSettings) -> PathBuf {
    settings.runtime_dir.join("config").join("vhosts.json")
}

fn load_vhosts(path: &PathBuf) -> Vec<VirtualHost> {
    if path.exists() {
        match std::fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    }
}

fn save_vhosts(path: &PathBuf, vhosts: &[VirtualHost]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(vhosts)?;
    std::fs::write(path, content)?;
    Ok(())
}

/// Generate an nginx server block for a virtual host
fn generate_vhost_conf(vhost: &VirtualHost) -> String {
    format!(
        "# Virtual host: {domain}\n\
         # Managed by Envora\n\
         server {{\n\
         \x20   listen       {port};\n\
         \x20   server_name  {domain};\n\
         \x20   root         {root_dir};\n\
         \x20   index        index.html index.php;\n\
         \n\
         \x20   location / {{\n\
         \x20       try_files $uri $uri/ /index.php?$query_string;\n\
         \x20   }}\n\
         \n\
         \x20   location ~ \\.php$ {{\n\
         \x20       fastcgi_pass   127.0.0.1:9000;\n\
         \x20       fastcgi_index  index.php;\n\
         \x20       fastcgi_param  SCRIPT_FILENAME  $document_root$fastcgi_script_name;\n\
         \x20       include        fastcgi_params;\n\
         \x20   }}\n\
         }}\n",
        domain = vhost.domain,
        port = vhost.port,
        root_dir = vhost.root_dir,
    )
}

fn write_vhost_conf(settings: &crate::settings::manager::AppSettings, version: &str, vhost: &VirtualHost) -> Result<(), AppError> {
    let path = vhosts_dir(settings, version).join(format!("{}.conf", vhost.domain));
    std::fs::create_dir_all(path.parent().unwrap())?;
    let conf = generate_vhost_conf(vhost);
    std::fs::write(&path, conf)?;
    Ok(())
}

fn remove_vhost_conf(settings: &crate::settings::manager::AppSettings, version: &str, domain: &str) -> Result<(), AppError> {
    let path = vhosts_dir(settings, version).join(format!("{}.conf", domain));
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

// ── nginx.conf ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_nginx_config(
    state: State<'_, AppState>,
    version: String,
) -> Result<String, AppError> {
    let settings = state.settings.lock().await;
    let path = nginx_dir(settings.get(), &version).join("conf").join("nginx.conf");

    if !path.exists() {
        return Err(AppError::Config(format!(
            "nginx.conf not found for Nginx {}",
            version
        )));
    }

    std::fs::read_to_string(&path).map_err(|e| AppError::Io(e))
}

#[tauri::command]
pub async fn save_nginx_config(
    state: State<'_, AppState>,
    version: String,
    content: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let path = nginx_dir(settings.get(), &version).join("conf").join("nginx.conf");

    // Write to a temp file and test syntax first
    let tmp_path = path.with_extension("nginx.conf.tmp");
    std::fs::write(&tmp_path, &content)?;

    let nginx_bin = nginx_dir(settings.get(), &version).join("sbin").join("nginx");
    let output = PlatformOps::shell_command(&format!(
        "\"{}\" -t -c \"{}\" 2>&1",
        nginx_bin.display(),
        tmp_path.display()
    ))
    .output()?;

    if !output.status.success() {
        let error_text = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_file(&tmp_path);
        return Err(AppError::Config(format!(
            "Nginx config syntax error:\n{}",
            error_text
        )));
    }

    // Syntax OK — backup and save
    let backup = path.with_extension("nginx.conf.bak");
    if path.exists() {
        let _ = std::fs::copy(&path, &backup);
    }
    std::fs::rename(&tmp_path, &path)?;

    Ok(())
}

#[tauri::command]
pub async fn reload_nginx(
    state: State<'_, AppState>,
    version: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let nginx_bin = nginx_dir(settings.get(), &version).join("sbin").join("nginx");
    drop(settings);

    let output = PlatformOps::shell_command(&format!(
        "\"{}\" -s reload",
        nginx_bin.display()
    ))
    .output()?;

    if !output.status.success() {
        return Err(AppError::Other(format!(
            "Nginx reload failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

// ── Virtual Hosts ──────────────────────────────────────────────────

#[tauri::command]
pub async fn list_vhosts(
    state: State<'_, AppState>,
) -> Result<Vec<VirtualHost>, AppError> {
    let settings = state.settings.lock().await;
    let path = vhosts_file(settings.get());
    Ok(load_vhosts(&path))
}

#[tauri::command]
pub async fn create_vhost(
    state: State<'_, AppState>,
    config: VHostConfig,
    nginx_version: String,
) -> Result<VirtualHost, AppError> {
    let settings = state.settings.lock().await;
    let path = vhosts_file(settings.get());

    let vhost = VirtualHost {
        id: uuid::Uuid::new_v4().to_string(),
        domain: config.domain.clone(),
        root_dir: config.root_dir.clone(),
        php_version: config.php_version,
        port: config.port,
        enabled: true,
        hosts_managed: false,
    };

    // Write nginx conf
    write_vhost_conf(settings.get(), &nginx_version, &vhost)?;

    // Persist to vhosts.json
    let mut vhosts = load_vhosts(&path);
    vhosts.push(vhost.clone());
    save_vhosts(&path, &vhosts)?;

    // Reload nginx
    drop(settings);
    // Ignore reload errors (nginx might not be running)

    Ok(vhost)
}

#[tauri::command]
pub async fn delete_vhost(
    state: State<'_, AppState>,
    id: String,
    nginx_version: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let path = vhosts_file(settings.get());

    let mut vhosts = load_vhosts(&path);
    let vhost = vhosts.iter().find(|v| v.id == id).cloned();
    vhosts.retain(|v| v.id != id);
    save_vhosts(&path, &vhosts)?;

    if let Some(v) = vhost {
        remove_vhost_conf(settings.get(), &nginx_version, &v.domain)?;
    }

    Ok(())
}

// ── Hosts File ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_hosts_content() -> Result<String, AppError> {
    let path = "/etc/hosts";
    std::fs::read_to_string(path).map_err(|e| AppError::Io(e))
}

#[tauri::command]
pub async fn add_hosts_entry(domain: String) -> Result<(), AppError> {
    let entry = format!("127.0.0.1 {}\n", domain);
    let cmd = format!(
        "osascript -e 'do shell script \"echo \\\"{}\\\" >> /etc/hosts\" with administrator privileges'",
        entry.replace('\\', "\\\\").replace('"', "\\\"")
    );

    let output = PlatformOps::shell_command(&cmd).output()?;
    if !output.status.success() {
        return Err(AppError::Other("Failed to add hosts entry — admin password required".to_string()));
    }
    Ok(())
}

#[tauri::command]
pub async fn remove_hosts_entry(domain: String) -> Result<(), AppError> {
    // Use sed to remove the line containing the domain
    let cmd = format!(
        "osascript -e 'do shell script \"sed -i \\\"\\\" \\\"/{domain}\\/d\\\" /etc/hosts\" with administrator privileges'",
        domain = domain.replace('.', "\\.")
    );

    let output = PlatformOps::shell_command(&cmd).output()?;
    if !output.status.success() {
        return Err(AppError::Other("Failed to remove hosts entry — admin password required".to_string()));
    }
    Ok(())
}
