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

#[derive(Debug, Clone, Serialize)]
pub struct VHostConfFile {
    pub path: String,
    pub content: String,
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
    let root_dir = vhost.root_dir.replace('\\', "\\\\").replace('"', "\\\"");

    format!(
        "# Virtual host: {domain}\n\
         # Managed by Envora\n\
         server {{\n\
         \x20   listen       {port};\n\
         \x20   server_name  {domain};\n\
         \x20   root         \"{root_dir}\";\n\
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
        root_dir = root_dir,
    )
}

fn write_vhost_conf(
    settings: &crate::settings::manager::AppSettings,
    version: &str,
    vhost: &VirtualHost,
) -> Result<(), AppError> {
    let path = vhosts_dir(settings, version).join(format!("{}.conf", vhost.domain));
    std::fs::create_dir_all(path.parent().unwrap())?;
    let conf = generate_vhost_conf(vhost);
    std::fs::write(&path, conf)?;
    Ok(())
}

fn remove_vhost_conf(
    settings: &crate::settings::manager::AppSettings,
    version: &str,
    domain: &str,
) -> Result<(), AppError> {
    let path = vhosts_dir(settings, version).join(format!("{}.conf", domain));
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

fn vhost_conf_path(
    settings: &crate::settings::manager::AppSettings,
    version: &str,
    domain: &str,
) -> PathBuf {
    vhosts_dir(settings, version).join(format!("{}.conf", domain))
}

fn ensure_vhosts_include(
    settings: &crate::settings::manager::AppSettings,
    version: &str,
) -> Result<(), AppError> {
    let nginx_conf = nginx_dir(settings, version).join("conf").join("nginx.conf");
    let include_line = format!(
        "    include {}/*.conf;",
        vhosts_dir(settings, version).display()
    );

    let content = std::fs::read_to_string(&nginx_conf)?;
    if content.contains(&include_line)
        || content.contains("conf/vhosts/*.conf")
        || content.contains("/vhosts/*.conf")
    {
        return Ok(());
    }

    let next_content = if let Some(index) = content.rfind("\n}") {
        let (head, tail) = content.split_at(index);
        format!(
            "{}\n\n    # Include Envora site configs\n{}\n{}",
            head, include_line, tail
        )
    } else {
        format!(
            "{}\n\n# Include Envora site configs\n{}\n",
            content.trim_end(),
            include_line.trim_start()
        )
    };

    let backup = nginx_conf.with_extension("nginx.conf.bak");
    let _ = std::fs::copy(&nginx_conf, &backup);
    std::fs::write(&nginx_conf, next_content)?;

    Ok(())
}

fn test_nginx_config(
    settings: &crate::settings::manager::AppSettings,
    version: &str,
) -> Result<(), AppError> {
    let nginx_bin = nginx_dir(settings, version).join("sbin").join("nginx");
    let conf = nginx_dir(settings, version).join("conf").join("nginx.conf");
    let output = PlatformOps::shell_command(&format!(
        "\"{}\" -t -c \"{}\" 2>&1",
        nginx_bin.display(),
        conf.display()
    ))
    .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(AppError::Config(format!(
            "Nginx config syntax error:\n{}{}",
            stdout, stderr
        )));
    }

    Ok(())
}

fn reload_nginx_config(
    settings: &crate::settings::manager::AppSettings,
    version: &str,
) -> Result<(), AppError> {
    let nginx_bin = nginx_dir(settings, version).join("sbin").join("nginx");
    let conf = nginx_dir(settings, version).join("conf").join("nginx.conf");

    let output = PlatformOps::shell_command(&format!(
        "\"{}\" -s reload -c \"{}\"",
        nginx_bin.display(),
        conf.display()
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

// ── nginx.conf ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_nginx_config(
    state: State<'_, AppState>,
    version: String,
) -> Result<String, AppError> {
    let settings = state.settings.lock().await;
    let path = nginx_dir(settings.get(), &version)
        .join("conf")
        .join("nginx.conf");

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
    let path = nginx_dir(settings.get(), &version)
        .join("conf")
        .join("nginx.conf");

    // Write to a temp file and test syntax first
    let tmp_path = path.with_extension("nginx.conf.tmp");
    std::fs::write(&tmp_path, &content)?;

    let nginx_bin = nginx_dir(settings.get(), &version)
        .join("sbin")
        .join("nginx");
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
pub async fn reload_nginx(state: State<'_, AppState>, version: String) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    reload_nginx_config(settings.get(), &version)
}

// ── Virtual Hosts ──────────────────────────────────────────────────

#[tauri::command]
pub async fn list_vhosts(state: State<'_, AppState>) -> Result<Vec<VirtualHost>, AppError> {
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

    ensure_vhosts_include(settings.get(), &nginx_version)?;

    // Write nginx conf
    write_vhost_conf(settings.get(), &nginx_version, &vhost)?;
    if let Err(error) = test_nginx_config(settings.get(), &nginx_version) {
        let _ = remove_vhost_conf(settings.get(), &nginx_version, &vhost.domain);
        return Err(error);
    }

    // Persist to vhosts.json
    let mut vhosts = load_vhosts(&path);
    vhosts.push(vhost.clone());
    save_vhosts(&path, &vhosts)?;

    let _ = reload_nginx_config(settings.get(), &nginx_version);

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

    let _ = reload_nginx_config(settings.get(), &nginx_version);

    Ok(())
}

#[tauri::command]
pub async fn get_vhost_config(
    state: State<'_, AppState>,
    id: String,
    nginx_version: String,
) -> Result<VHostConfFile, AppError> {
    let settings = state.settings.lock().await;
    let path = vhosts_file(settings.get());
    let vhosts = load_vhosts(&path);
    let vhost = vhosts
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| AppError::Config("站点不存在".to_string()))?;
    let conf_path = vhost_conf_path(settings.get(), &nginx_version, &vhost.domain);

    if !conf_path.exists() {
        return Err(AppError::Config(format!(
            "站点配置文件不存在：{}",
            conf_path.display()
        )));
    }

    Ok(VHostConfFile {
        path: conf_path.display().to_string(),
        content: std::fs::read_to_string(&conf_path)?,
    })
}

#[tauri::command]
pub async fn save_vhost_config(
    state: State<'_, AppState>,
    id: String,
    nginx_version: String,
    content: String,
) -> Result<(), AppError> {
    let settings = state.settings.lock().await;
    let path = vhosts_file(settings.get());
    let vhosts = load_vhosts(&path);
    let vhost = vhosts
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| AppError::Config("站点不存在".to_string()))?;
    let conf_path = vhost_conf_path(settings.get(), &nginx_version, &vhost.domain);
    let backup = conf_path.with_extension("conf.bak");

    if conf_path.exists() {
        let _ = std::fs::copy(&conf_path, &backup);
    }

    std::fs::write(&conf_path, content)?;

    if let Err(error) = test_nginx_config(settings.get(), &nginx_version) {
        if backup.exists() {
            let _ = std::fs::copy(&backup, &conf_path);
        }
        return Err(error);
    }

    let _ = reload_nginx_config(settings.get(), &nginx_version);

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
        return Err(AppError::Other(
            "Failed to add hosts entry — admin password required".to_string(),
        ));
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
        return Err(AppError::Other(
            "Failed to remove hosts entry — admin password required".to_string(),
        ));
    }
    Ok(())
}
