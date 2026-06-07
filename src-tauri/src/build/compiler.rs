use std::collections::HashMap;
use std::path::PathBuf;

use crate::core::platform::PlatformOps;
use crate::core::AppError;

/// Build configuration for compiling from source
pub struct BuildConfig {
    pub source_dir: PathBuf,
    pub install_dir: PathBuf,
    pub configure_args: Vec<String>,
    pub env_vars: HashMap<String, String>,
}

/// Run a build process: configure → make → make install
pub async fn run_build<F>(
    config: BuildConfig,
    on_progress: F,
) -> Result<(), AppError>
where
    F: Fn(f64, String) + Send + Sync,
{
    let num_cpus = PlatformOps::num_cpus();

    // Configure
    on_progress(0.1, "Configuring...".to_string());

    let configure_cmd = format!(
        "cd \"{}\" && ./configure --prefix=\"{}\" {}",
        config.source_dir.display(),
        config.install_dir.display(),
        config.configure_args.join(" ")
    );

    let mut cmd = PlatformOps::shell_command(&configure_cmd);
    for (key, value) in &config.env_vars {
        cmd.env(key, value);
    }

    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::Build(format!(
            "Configure failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    // Make
    on_progress(0.3, "Compiling...".to_string());

    let make_cmd = format!(
        "cd \"{}\" && make -j{}",
        config.source_dir.display(),
        num_cpus
    );

    let output = PlatformOps::shell_command(&make_cmd).output()?;
    if !output.status.success() {
        return Err(AppError::Build(format!(
            "Make failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    // Make install
    on_progress(0.8, "Installing...".to_string());

    let install_cmd = format!(
        "cd \"{}\" && make install",
        config.source_dir.display()
    );

    let output = PlatformOps::shell_command(&install_cmd).output()?;
    if !output.status.success() {
        return Err(AppError::Build(format!(
            "Make install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    on_progress(1.0, "Build complete!".to_string());

    Ok(())
}
